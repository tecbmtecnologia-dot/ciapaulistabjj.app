import { useState, useEffect, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Shield, User, Users, QrCode, Camera, Check, Plus, Trash2, X, Award, CalendarCheck, CreditCard, ChevronRight, LogOut, Gift } from "lucide-react";

/* ---- Conexão com Supabase (embutida para funcionar como artefato de arquivo único) ---- */
const SUPABASE_URL = "https://bzcvckrlettgnauvcmaz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Y3Zja3JsZXR0Z25hdXZjbWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzODg4ODEsImV4cCI6MjEwMTk2NDg4MX0.QzUohc8ykAehZgRHTqFkM38HIBQemtd9godKDpVikCc";

const BASE = `${SUPABASE_URL}/rest/v1`;

async function pgFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.message || j.error_description || msg;
    } catch (_) {}
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const pg = {
  select: (table, query = "") => pgFetch(`/${table}?select=*${query}`),
  upsert: (table, rows) =>
    pgFetch(`/${table}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    }),
  update: (table, id, patch) =>
    pgFetch(`/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }),
  deleteIn: (table, ids) =>
    pgFetch(`/${table}?id=in.(${ids.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }),
};

/* Mapas de campo: chave usada na interface -> coluna no banco. */
const MAPS = {
  academia: {
    nome: "nome", chavePix: "chave_pix", logo: "logo", termoPadrao: "termo_padrao",
    termoPdf: "termo_pdf", termoPdfNome: "termo_pdf_nome", senhaAdmin: "senha_admin",
  },
  faixas: {
    id: "id", nome: "nome", cor: "cor", texto: "texto", borda: "borda",
    grausMax: "graus_max", tempoMinimoAnos: "tempo_minimo_anos", aulasPorGrau: "aulas_por_grau",
    categoria: "categoria", observacoes: "observacoes", ordem: "ordem",
  },
  planos: { id: "id", nome: "nome", valor: "valor", periodicidade: "periodicidade" },
  turmas: { id: "id", nome: "nome", dias: "dias", horario: "horario" },
  professores: {
    id: "id", nome: "nome", email: "email", especialidade: "especialidade",
    telefone: "telefone", endereco: "endereco", faixaId: "faixa_id", grau: "grau",
  },
  alunos: {
    id: "id", nome: "nome", email: "email", senha: "senha", primeiroAcesso: "primeiro_acesso",
    telefone: "telefone", endereco: "endereco", contatoEmergenciaNome: "contato_emergencia_nome",
    contatoEmergenciaTelefone: "contato_emergencia_telefone", foto: "foto", faixaId: "faixa_id",
    grau: "grau", dataNascimento: "data_nascimento", matricula: "matricula", planoId: "plano_id",
    diaVencimento: "dia_vencimento", ultimoPagamento: "ultimo_pagamento",
    checkinsDesdeGraduacao: "checkins_desde_graduacao", termoAceito: "termo_aceito",
    termoAceitoEm: "termo_aceito_em", termoAssinadoManual: "termo_assinado_manual",
  },
  pagamentos: { id: "id", alunoId: "aluno_id", data: "data", valor: "valor" },
  sessoes_checkin: {
    id: "id", treinoId: "turma_id", professorId: "professor_id", codigo: "codigo",
    criadoEm: "criado_em", ativa: "ativa",
  },
  checkins: { id: "id", sessaoId: "sessao_id", alunoId: "aluno_id", dataHora: "data_hora" },
};

function toDb(entity, obj) {
  const map = MAPS[entity];
  const row = {};
  for (const [jsKey, dbKey] of Object.entries(map)) {
    if (obj[jsKey] === undefined) continue;
    row[dbKey] = obj[jsKey] === "" && ["email", "faixaId", "planoId"].includes(jsKey) ? null : obj[jsKey];
  }
  return row;
}

function fromDb(entity, row) {
  const map = MAPS[entity];
  const obj = {};
  for (const [jsKey, dbKey] of Object.entries(map)) obj[jsKey] = row[dbKey];
  return obj;
}

/* Upsert de todas as linhas atuais + remoção das que não existem mais na lista (cobre criar, editar e excluir). */
async function syncTable(entity, items) {
  const rows = items.map((it) => toDb(entity, it));
  const existing = await pg.select(entity, "&select=id");
  const existingIds = (existing || []).map((r) => r.id);
  const nextIds = items.map((it) => it.id);
  const toDelete = existingIds.filter((id) => !nextIds.includes(id));

  if (rows.length) await pg.upsert(entity, rows);
  if (toDelete.length) await pg.deleteIn(entity, toDelete);
}

async function loadAll() {
  const [academiaRows, faixasRows, planosRows, turmasRows, professoresRows, alunosRows, pagamentosRows, sessoesRows, checkinsRows] = await Promise.all([
    pg.select("academia", "&limit=1"),
    pg.select("faixas", "&order=ordem.asc"),
    pg.select("planos"),
    pg.select("turmas"),
    pg.select("professores"),
    pg.select("alunos"),
    pg.select("pagamentos"),
    pg.select("sessoes_checkin"),
    pg.select("checkins"),
  ]);

  if (!academiaRows || academiaRows.length === 0) {
    throw new Error("Tabela 'academia' está vazia — rode o script SQL no Supabase antes de conectar o app.");
  }

  const academia = fromDb("academia", academiaRows[0]);
  academia.id = academiaRows[0].id;

  const pagamentosPorAluno = {};
  (pagamentosRows || []).forEach((row) => {
    const p = fromDb("pagamentos", row);
    if (!pagamentosPorAluno[p.alunoId]) pagamentosPorAluno[p.alunoId] = [];
    pagamentosPorAluno[p.alunoId].push({ id: p.id, data: p.data, valor: Number(p.valor) });
  });

  const alunos = (alunosRows || []).map((row) => {
    const a = fromDb("alunos", row);
    a.grau = Number(a.grau) || 0;
    a.diaVencimento = a.diaVencimento === null ? null : Number(a.diaVencimento);
    a.checkinsDesdeGraduacao = Number(a.checkinsDesdeGraduacao) || 0;
    a.pagamentos = pagamentosPorAluno[a.id] || [];
    return a;
  });

  const faixas = (faixasRows || []).map((row) => {
    const f = fromDb("faixas", row);
    f.grausMax = Number(f.grausMax) || 0;
    f.tempoMinimoAnos = f.tempoMinimoAnos === null ? null : Number(f.tempoMinimoAnos);
    f.aulasPorGrau = f.aulasPorGrau === null ? null : Number(f.aulasPorGrau);
    return f;
  });

  const planos = (planosRows || []).map((row) => { const p = fromDb("planos", row); p.valor = Number(p.valor); return p; });
  const turmas = (turmasRows || []).map((row) => fromDb("turmas", row));
  const professores = (professoresRows || []).map((row) => { const p = fromDb("professores", row); p.grau = Number(p.grau) || 0; return p; });
  const sessoes = (sessoesRows || []).map((row) => fromDb("sessoes_checkin", row));
  const checkins = (checkinsRows || []).map((row) => fromDb("checkins", row));

  return { academia, faixas, planos, turmas, professores, alunos, sessoes, checkins };
}

async function saveAll(next) {
  const academiaRow = toDb("academia", next.academia);
  await pg.update("academia", next.academia.id, academiaRow);

  const faixasComOrdem = next.faixas.map((f, i) => ({ ...f, ordem: i }));

  await syncTable("faixas", faixasComOrdem);
  await syncTable("planos", next.planos);
  await syncTable("turmas", next.turmas);
  await syncTable("professores", next.professores);
  await syncTable("alunos", next.alunos);
  await syncTable("sessoes_checkin", next.sessoes);
  await syncTable("checkins", next.checkins);

  const todosPagamentos = next.alunos.flatMap((a) => (a.pagamentos || []).map((p) => ({ ...p, alunoId: a.id })));
  await syncTable("pagamentos", todosPagamentos);
}


const STORAGE_KEY = "qg-data-v3";
const PERIOD_MESES = { mensal: 1, trimestral: 3, anual: 12 };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const formatDias = (dias) => (Array.isArray(dias) ? dias.join("/") : (dias || ""));

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const randomCode = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
const hoje = () => new Date().toISOString().slice(0, 10);
const randomSenha = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function addMeses(dataStr, n) {
  if (!dataStr) return null;
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, (m - 1) + n, d);
  return dt.toISOString().slice(0, 10);
}

function statusPagamento(aluno, planos) {
  const plano = (planos || []).find((p) => p.id === aluno.planoId);
  if (!aluno.ultimoPagamento || !plano) return { emDia: false, vencimento: null, plano };
  let vencimento = addMeses(aluno.ultimoPagamento, PERIOD_MESES[plano.periodicidade] || 1);
  if (aluno.diaVencimento) {
    const [y, m] = vencimento.split("-");
    vencimento = `${y}-${m}-${String(aluno.diaVencimento).padStart(2, "0")}`;
  }
  return { emDia: vencimento >= hoje(), vencimento, plano };
}

const FAIXAS_IBJJF = [
  { id: "branca", nome: "Branca", cor: "#F5F3EC", texto: "#1B2027", borda: "#D8D3C4", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "cinza-branca", nome: "Cinza e Branca", cor: "#D9D9D6", texto: "#1B2027", borda: "#B9B9B4", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "cinza", nome: "Cinza", cor: "#A9A9A5", texto: "#1B2027", borda: "#8B8B87", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "cinza-preta", nome: "Cinza e Preta", cor: "#6E6E6B", texto: "#FFFFFF", borda: "#4E4E4C", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "amarela-branca", nome: "Amarela e Branca", cor: "#F5E28A", texto: "#1B2027", borda: "#D9C55F", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "amarela", nome: "Amarela", cor: "#F2C927", texto: "#1B2027", borda: "#C9A227", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "amarela-preta", nome: "Amarela e Preta", cor: "#C9A227", texto: "#1B2027", borda: "#8C7016", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "laranja-branca", nome: "Laranja e Branca", cor: "#F5B26B", texto: "#1B2027", borda: "#D98E3D", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "laranja", nome: "Laranja", cor: "#E8791D", texto: "#FFFFFF", borda: "#B85E14", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "laranja-preta", nome: "Laranja e Preta", cor: "#B85E14", texto: "#FFFFFF", borda: "#7E3E0C", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "verde-branca", nome: "Verde e Branca", cor: "#A8D5A2", texto: "#1B2027", borda: "#7CB876", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "verde", nome: "Verde", cor: "#2E8B3D", texto: "#FFFFFF", borda: "#1F5C2A", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "verde-preta", nome: "Verde e Preta", cor: "#1F5C2A", texto: "#FFFFFF", borda: "#123A1A", grausMax: 4, tempoMinimoAnos: null, aulasPorGrau: null, categoria: "Infantil" },
  { id: "azul", nome: "Azul", cor: "#1959AE", texto: "#FFFFFF", borda: "#123E7C", grausMax: 4, tempoMinimoAnos: 2, aulasPorGrau: 40, categoria: "Adulto" },
  { id: "roxa", nome: "Roxa", cor: "#6B2D8C", texto: "#FFFFFF", borda: "#4E2166", grausMax: 4, tempoMinimoAnos: 1.5, aulasPorGrau: null, categoria: "Adulto" },
  { id: "marrom", nome: "Marrom", cor: "#5A3A22", texto: "#FFFFFF", borda: "#402913", grausMax: 4, tempoMinimoAnos: 1, aulasPorGrau: null, categoria: "Adulto" },
  { id: "preta", nome: "Preta", cor: "#17181B", texto: "#FFFFFF", borda: "#000000", grausMax: 6, tempoMinimoAnos: 3, aulasPorGrau: null, categoria: "Adulto", observacoes: "IBJJF: 3 anos entre o 1º e o 3º grau, 5 anos a partir do 4º grau." },
  { id: "vermelha-preta", nome: "Vermelha e Preta (7º grau)", cor: "#8C1414", texto: "#FFFFFF", borda: "#5C0D0D", grausMax: 0, tempoMinimoAnos: 7, aulasPorGrau: null, categoria: "Mestre" },
  { id: "vermelha-branca", nome: "Vermelha e Branca (8º grau)", cor: "#B5251F", texto: "#FFFFFF", borda: "#7C1915", grausMax: 0, tempoMinimoAnos: 7, aulasPorGrau: null, categoria: "Mestre" },
  { id: "vermelha", nome: "Vermelha (9º grau)", cor: "#C81E1E", texto: "#FFFFFF", borda: "#8C1414", grausMax: 0, tempoMinimoAnos: 10, aulasPorGrau: null, categoria: "Mestre" },
];

const PLANOS_PADRAO = [
  { id: "mensal", nome: "Mensal", valor: 150, periodicidade: "mensal" },
  { id: "trimestral", nome: "Trimestral", valor: 405, periodicidade: "trimestral" },
  { id: "anual", nome: "Anual", valor: 1440, periodicidade: "anual" },
  { id: "policial", nome: "Policial", valor: 100, periodicidade: "mensal" },
  { id: "vip", nome: "VIP", valor: 250, periodicidade: "mensal" },
];

const LOGO_PADRAO = "data:image/png;base64,data:image/png;base64,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";

function seed() {
  const p1 = { id: uid(), tipo: "professor", nome: "Mestre Rafael Souza", email: "rafael@qg.com", especialidade: "Fundamentos e Competição" };
  const a1 = {
    id: uid(), tipo: "aluno", nome: "João Pedro Lima", email: "joao@aluno.com", senha: "123456", primeiroAcesso: false,
    telefone: "", endereco: "", contatoEmergenciaNome: "", contatoEmergenciaTelefone: "", foto: null,
    faixaId: "azul", grau: 2, dataNascimento: "1998-08-15", matricula: hoje(), planoId: "mensal", diaVencimento: 10,
    ultimoPagamento: hoje(), pagamentos: [{ id: uid(), data: hoje(), valor: 150 }], checkinsDesdeGraduacao: 12,
    termoAceito: true, termoAceitoEm: new Date().toISOString(), termoAssinadoManual: false,
  };
  const a2 = {
    id: uid(), tipo: "aluno", nome: "Marina Alves", email: "marina@aluno.com", senha: "123456", primeiroAcesso: true,
    telefone: "", endereco: "", contatoEmergenciaNome: "", contatoEmergenciaTelefone: "", foto: null,
    faixaId: "branca", grau: 0, dataNascimento: "2001-03-02", matricula: hoje(), planoId: "vip", diaVencimento: 5,
    ultimoPagamento: null, pagamentos: [], checkinsDesdeGraduacao: 0,
    termoAceito: false, termoAceitoEm: null, termoAssinadoManual: false,
  };
  const t1 = { id: uid(), nome: "Fundamentos", dias: ["Seg", "Qua", "Sex"], horario: "19:00" };
  const t2 = { id: uid(), nome: "Competição", dias: ["Ter", "Qui"], horario: "20:30" };
  return {
    academia: {
      nome: "QG Cia Paulista", chavePix: "", logo: LOGO_PADRAO, termoPdf: null, termoPdfNome: "", senhaAdmin: "admin123",
      termoPadrao: "Declaro estar ciente dos riscos inerentes à prática de Jiu-Jitsu e libero a equipe QG de responsabilidade por lesões decorrentes do treino, comprometendo-me a seguir as normas de segurança da academia.",
    },
    professores: [p1],
    alunos: [a1, a2],
    turmas: [t1, t2],
    faixas: FAIXAS_IBJJF,
    planos: PLANOS_PADRAO,
    sessoes: [],
    checkins: [],
  };
}

function useFonts() {
  useEffect(() => {
    if (document.getElementById("qg-fonts")) return;
    const link = document.createElement("link");
    link.id = "qg-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

function BeltBar({ faixas, faixaId, grau, size = "md" }) {
  const f = (faixas || []).find((x) => x.id === faixaId) || (faixas || [])[0] || { cor: "#F5F3EC", borda: "#D8D3C4", grausMax: 4, nome: "—" };
  const h = size === "lg" ? 40 : 24;
  const w = size === "lg" ? 220 : 140;
  const tipW = w * 0.22;
  const slots = Array.from({ length: f.grausMax || 0 });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: w, height: h, borderRadius: 4, background: f.cor, border: `2px solid ${f.borda}`, overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: tipW, background: "#17181B" }}>
          <div style={{ display: "flex", gap: 3, position: "absolute", left: 4, top: 0, bottom: 0, alignItems: "center" }}>
            {slots.map((_, i) => (
              <div key={i} style={{ width: 3, height: "70%", background: i < grau ? "#FFFFFF" : "rgba(255,255,255,0.18)", borderRadius: 1 }} />
            ))}
          </div>
        </div>
      </div>
      <span style={{ fontFamily: "Inter", fontSize: size === "lg" ? 15 : 13, fontWeight: 600, color: "#1B2027" }}>
        Faixa {f.nome}{f.grausMax > 0 ? ` · ${grau}º grau` : ""}
      </span>
    </div>
  );
}

function Avatar({ foto, nome, size = 36 }) {
  const iniciais = nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return foto ? (
    <img src={foto} alt={nome} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "2px solid #12213B" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#12213B", color: "#C9A227", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 700, fontSize: size * 0.38 }}>
      {iniciais}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D6", borderRadius: 12, padding: 18, ...style }}>{children}</div>;
}

function Button({ children, onClick, variant = "primary", icon: Icon, style, type = "button", disabled }) {
  const variants = {
    primary: { background: "#12213B", color: "#FFFFFF" },
    gold: { background: "#C9A227", color: "#17181B" },
    ghost: { background: "transparent", color: "#12213B", border: "1px solid #C7C1B0" },
    danger: { background: "#FFF3F0", color: "#B3261E", border: "1px solid #F3C9C0" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 13.5, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: "none", ...variants[variant], ...style }}>
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontFamily: "Inter" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#5A5648", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = { padding: "9px 11px", borderRadius: 7, border: "1px solid #D8D3C4", fontFamily: "Inter", fontSize: 14, outline: "none", background: "#FBFAF7" };
const iconBtnStyle = { border: "1px solid #D8D3C4", background: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 13 };
const blockTitleStyle = { fontWeight: 700, fontSize: 14, marginBottom: 10, fontFamily: "Oswald", textTransform: "uppercase", color: "#12213B" };

function Tag({ ok, children }) {
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, background: ok ? "#E7F4E8" : "#FFF3F0", color: ok ? "#1E7A34" : "#B3261E" }}>{children}</span>;
}

function Empty({ children }) {
  return <div style={{ padding: 24, textAlign: "center", color: "#8A8574", fontSize: 13.5, border: "1px dashed #D8D3C4", borderRadius: 10 }}>{children}</div>;
}

function ConfirmDelete({ onConfirm, size = 16 }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11.5, color: "#B3261E", fontWeight: 700 }}>Confirmar?</span>
        <button onClick={() => { onConfirm(); setConfirmando(false); }} style={{ border: "none", background: "#B3261E", color: "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Sim</button>
        <button onClick={() => setConfirmando(false)} style={{ border: "1px solid #D8D3C4", background: "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 11.5, cursor: "pointer" }}>Não</button>
      </span>
    );
  }
  return (
    <button onClick={() => setConfirmando(true)} style={{ border: "none", background: "none", cursor: "pointer", color: "#B3261E" }}>
      <Trash2 size={size} />
    </button>
  );
}

function ConfirmButton({ onConfirm, children, icon = Check, variant = "primary" }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "#5A5648", fontWeight: 600 }}>Confirma salvar?</span>
        <Button variant="gold" onClick={() => { onConfirm(); setConfirmando(false); }}>Sim</Button>
        <Button variant="ghost" onClick={() => setConfirmando(false)}>Não</Button>
      </span>
    );
  }
  return (
    <Button icon={icon} variant={variant} onClick={() => setConfirmando(true)}>{children}</Button>
  );
}

export default function App({ modo = "admin" }) {
  useFonts();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erroConexao, setErroConexao] = useState(null);
  const [role, setRole] = useState(modo === "aluno" ? "aluno" : modo === "professor" ? "professor" : "admin");
  const [adminDesbloqueado, setAdminDesbloqueado] = useState(false);
  const [activeProfId, setActiveProfId] = useState(null);
  const [activeAlunoId, setActiveAlunoId] = useState(null);

  useEffect(() => {
    try { setAdminDesbloqueado(sessionStorage.getItem("qg-admin-ok") === "1"); } catch (_) {}
  }, []);

  const carregar = async () => {
    setLoading(true);
    setErroConexao(null);
    try {
      const fresh = await loadAll();
      setData(fresh);
    } catch (e) {
      setErroConexao(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const save = async (next) => {
    setData(next);
    try {
      await saveAll(next);
    } catch (e) {
      setErroConexao(e?.message || String(e));
    }
  };

  const desbloquearAdmin = () => {
    try { sessionStorage.setItem("qg-admin-ok", "1"); } catch (_) {}
    setAdminDesbloqueado(true);
  };

  if (loading) return <div style={{ padding: 40, fontFamily: "Inter", color: "#5A5648" }}>Carregando dados do banco…</div>;

  if (erroConexao && !data) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: 20, fontFamily: "Inter" }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#B3261E", marginBottom: 8 }}>Não foi possível conectar ao banco de dados</div>
          <div style={{ fontSize: 12.5, color: "#5A5648", marginBottom: 12 }}>{erroConexao}</div>
          <Button onClick={carregar}>Tentar de novo</Button>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ minHeight: 600, background: "#F5F1E8", fontFamily: "Inter" }}>
      {erroConexao && (
        <div style={{ background: "#FFF3F0", color: "#B3261E", fontSize: 12.5, textAlign: "center", padding: "6px 10px" }}>
          Última ação pode não ter sido salva no banco: {erroConexao}
        </div>
      )}
      <TopNav role={role} setRole={(r) => { setRole(r); setActiveProfId(null); setActiveAlunoId(null); }} academia={data.academia} modo={modo} />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 20px 60px" }}>
        {role === "admin" && (adminDesbloqueado ? <AdminView data={data} save={save} /> : <AdminGate senhaCorreta={data.academia.senhaAdmin} onUnlock={desbloquearAdmin} />)}
        {role === "professor" && <ProfessorView data={data} save={save} activeProfId={activeProfId} setActiveProfId={setActiveProfId} />}
        {role === "aluno" && <AlunoView data={data} save={save} activeAlunoId={activeAlunoId} setActiveAlunoId={setActiveAlunoId} />}
      </div>
    </div>
  );
}

function AdminGate({ senhaCorreta, onUnlock }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const entrar = () => {
    if (senha === (senhaCorreta || "")) { setErro(""); onUnlock(); }
    else setErro("Senha incorreta.");
  };
  return (
    <div style={{ maxWidth: 360, margin: "40px auto" }}>
      <SectionTitle sub="Acesso restrito ao administrador">Painel administrador</SectionTitle>
      <Card>
        <Field label="Senha de administrador">
          <input type="password" style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
        </Field>
        {erro && <div style={{ fontSize: 12.5, color: "#B3261E", marginTop: 6 }}>{erro}</div>}
        <div style={{ marginTop: 12 }}><Button icon={Check} onClick={entrar}>Entrar</Button></div>
      </Card>
      <p style={{ fontSize: 11.5, color: "#8A8574", marginTop: 10 }}>Essa senha é uma proteção básica no navegador (não substitui um login seguro de verdade). Troque em Configurações.</p>
    </div>
  );
}

function TopNav({ role, setRole, academia, modo }) {
  const tabs = [
    { id: "admin", label: "Administrador", icon: Shield },
    { id: "professor", label: "Professores", icon: Award },
    { id: "aluno", label: "Alunos", icon: User },
  ];
  const mostrarTabs = modo === "admin";
  return (
    <div style={{ background: "#12213B", padding: "0 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
          {academia.logo ? (
            <img src={academia.logo} alt="logo" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#C9A227", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Oswald", fontWeight: 700, color: "#12213B" }}>{academia.nome[0]}</div>
          )}
          <span style={{ fontFamily: "Oswald", fontWeight: 700, fontSize: 20, letterSpacing: 0.5, color: "#FFFFFF", textTransform: "uppercase" }}>{academia.nome}</span>
        </div>
        {mostrarTabs && (
          <div style={{ display: "flex", gap: 4 }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = role === t.id;
              return (
                <button key={t.id} onClick={() => setRole(t.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "Inter", fontWeight: 600, fontSize: 13, background: active ? "#C9A227" : "transparent", color: active ? "#17181B" : "#C9C4B4" }}>
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: "#12213B", textTransform: "uppercase", letterSpacing: 0.3, margin: 0 }}>{children}</h2>
      {sub && <p style={{ margin: "3px 0 0", color: "#5A5648", fontSize: 13.5 }}>{sub}</p>}
    </div>
  );
}

/* ---------------- ADMIN ---------------- */
function AdminView({ data, save }) {
  const [tab, setTab] = useState("dashboard");
  const [novoAluno, setNovoAluno] = useState(false);
  const [editandoAluno, setEditandoAluno] = useState(null);
  const [novoProf, setNovoProf] = useState(false);
  const [editandoProf, setEditandoProf] = useState(null);
  const [novaTurma, setNovaTurma] = useState(false);
  const [editandoTurma, setEditandoTurma] = useState(null);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [senhaGerada, setSenhaGerada] = useState(null);

  const checkinsHoje = data.checkins.filter((c) => c.dataHora.slice(0, 10) === hoje()).length;
  const pendentes = data.alunos.filter((a) => !statusPagamento(a, data.planos).emDia).length;
  const termosPendentes = data.alunos.filter((a) => !a.termoAceito && !a.termoAssinadoManual).length;
  const porFaixa = data.faixas.map((f) => ({ name: f.nome, value: data.alunos.filter((a) => a.faixaId === f.id).length, color: f.cor })).filter((d) => d.value > 0);
  const aniversariantes = data.alunos.filter((a) => a.dataNascimento && Number(a.dataNascimento.split("-")[1]) - 1 === mesSelecionado).sort((x, y) => Number(x.dataNascimento.split("-")[2]) - Number(y.dataNascimento.split("-")[2]));

  const addAluno = async (form) => {
    const a = { id: uid(), tipo: "aluno", matricula: hoje(), ultimoPagamento: null, foto: null, pagamentos: [], checkinsDesdeGraduacao: 0, primeiroAcesso: true, termoAceito: false, termoAceitoEm: null, ...form };
    await save({ ...data, alunos: [...data.alunos, a] });
    setNovoAluno(false);
  };
  const editarAluno = async (id, form) => { const alunos = data.alunos.map((a) => (a.id === id ? { ...a, ...form } : a)); await save({ ...data, alunos }); setEditandoAluno(null); };
  const removerAluno = async (id) => { await save({ ...data, alunos: data.alunos.filter((a) => a.id !== id) }); };
  const resetarSenha = async (id) => {
    const nova = randomSenha();
    const alunos = data.alunos.map((a) => (a.id === id ? { ...a, senha: nova } : a));
    await save({ ...data, alunos });
    setSenhaGerada({ id, senha: nova });
  };

  const addProf = async (form) => { const p = { id: uid(), tipo: "professor", ...form }; await save({ ...data, professores: [...data.professores, p] }); setNovoProf(false); };
  const editarProf = async (id, form) => { const professores = data.professores.map((p) => (p.id === id ? { ...p, ...form } : p)); await save({ ...data, professores }); setEditandoProf(null); };
  const removerProf = async (id) => { await save({ ...data, professores: data.professores.filter((p) => p.id !== id) }); };

  const addTurma = async (form) => { const t = { id: uid(), ...form }; await save({ ...data, turmas: [...data.turmas, t] }); setNovaTurma(false); };
  const editarTurma = async (id, form) => { const turmas = data.turmas.map((t) => (t.id === id ? { ...t, ...form } : t)); await save({ ...data, turmas }); setEditandoTurma(null); };
  const removerTurma = async (id) => { await save({ ...data, turmas: data.turmas.filter((t) => t.id !== id) }); };

  const tabs = [
    { id: "dashboard", label: "Visão geral" },
    { id: "alunos", label: "Alunos" },
    { id: "professores", label: "Professores" },
    { id: "turmas", label: "Turmas" },
    { id: "graduacao", label: "Graduação" },
    { id: "planos", label: "Planos" },
    { id: "financeiro", label: "Financeiro" },
    { id: "config", label: "Configurações" },
  ];

  return (
    <div>
      <SectionTitle sub="Cadastro central de alunos, professores, graduação e financeiro do QG">Painel administrador</SectionTitle>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid #E7E2D6", paddingBottom: 10, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ border: "none", background: tab === t.id ? "#12213B" : "#EDE8DC", color: tab === t.id ? "#fff" : "#5A5648", padding: "7px 13px", borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
            <StatCard label="Alunos ativos" value={data.alunos.length} icon={Users} />
            <StatCard label="Professores" value={data.professores.length} icon={Award} />
            <StatCard label="Turmas" value={data.turmas.length} icon={CalendarCheck} />
            <StatCard label="Check-ins hoje" value={checkinsHoje} icon={QrCode} />
            <StatCard label="Pagamentos pendentes" value={pendentes} icon={CreditCard} />
            <StatCard label="Termos pendentes" value={termosPendentes} icon={Shield} />
          </div>

          {porFaixa.length > 0 && (
            <Card style={{ marginBottom: 14 }}>
              <div style={blockTitleStyle}>Alunos por faixa</div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={porFaixa} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(e) => `${e.name}: ${e.value}`}>
                    {porFaixa.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}

          <PagamentosChart data={data} />
          <AlunosPorMesChart data={data} />

          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={blockTitleStyle}>Aniversariantes</div>
              <select style={inputStyle} value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            {aniversariantes.length === 0 ? (
              <Empty>Nenhum aniversariante em {MESES[mesSelecionado]}.</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {aniversariantes.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                    <Gift size={15} color="#C9A227" />
                    <span style={{ fontWeight: 600 }}>{a.nome}</span>
                    <span style={{ color: "#8A8574" }}>dia {a.dataNascimento.split("-")[2]}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "alunos" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button icon={Plus} onClick={() => setNovoAluno(true)}>Novo aluno</Button>
          </div>
          {novoAluno && <PersonForm tipo="aluno" planos={data.planos} faixas={data.faixas} onCancel={() => setNovoAluno(false)} onSave={addAluno} />}
          {editandoAluno && <PersonForm tipo="aluno" planos={data.planos} faixas={data.faixas} initial={editandoAluno} onCancel={() => setEditandoAluno(null)} onSave={(form) => editarAluno(editandoAluno.id, form)} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.alunos.map((a) => {
              const { emDia, plano } = statusPagamento(a, data.planos);
              return (
                <Card key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar foto={a.foto} nome={a.nome} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome}</div>
                      <BeltBar faixas={data.faixas} faixaId={a.faixaId} grau={a.grau} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "#8A8574" }}>{plano?.nome || "sem plano"}</span>
                    <Tag ok={emDia}>{emDia ? "Pagamento em dia" : "Pagamento pendente"}</Tag>
                    <Tag ok={a.termoAceito || a.termoAssinadoManual}>{a.termoAceito || a.termoAssinadoManual ? "Termo OK" : "Termo pendente"}</Tag>
                    {senhaGerada?.id === a.id && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1E7A34" }}>Nova senha: {senhaGerada.senha}</span>}
                    <Button variant="ghost" onClick={() => resetarSenha(a.id)}>Redefinir senha</Button>
                    <Button variant="ghost" onClick={() => setEditandoAluno(a)}>Editar</Button>
                    <ConfirmDelete onConfirm={() => removerAluno(a.id)} />
                  </div>
                </Card>
              );
            })}
            {data.alunos.length === 0 && <Empty>Nenhum aluno cadastrado ainda.</Empty>}
          </div>
        </div>
      )}

      {tab === "professores" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button icon={Plus} onClick={() => setNovoProf(true)}>Novo professor</Button>
          </div>
          {novoProf && <PersonForm tipo="professor" faixas={data.faixas} onCancel={() => setNovoProf(false)} onSave={addProf} />}
          {editandoProf && <PersonForm tipo="professor" faixas={data.faixas} initial={editandoProf} onCancel={() => setEditandoProf(null)} onSave={(form) => editarProf(editandoProf.id, form)} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.professores.map((p) => (
              <Card key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar foto={null} nome={p.nome} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
                    <div style={{ fontSize: 12.5, color: "#5A5648" }}>{p.especialidade || "—"} {p.email && `· ${p.email}`} {p.telefone && `· ${p.telefone}`}</div>
                    {p.faixaId && <div style={{ marginTop: 4 }}><BeltBar faixas={data.faixas} faixaId={p.faixaId} grau={p.grau || 0} /></div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Button variant="ghost" onClick={() => setEditandoProf(p)}>Editar</Button>
                  <ConfirmDelete onConfirm={() => removerProf(p.id)} />
                </div>
              </Card>
            ))}
            {data.professores.length === 0 && <Empty>Nenhum professor cadastrado ainda.</Empty>}
          </div>
        </div>
      )}

      {tab === "turmas" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button icon={Plus} onClick={() => setNovaTurma(true)}>Nova turma</Button>
          </div>
          {novaTurma && <TurmaForm onCancel={() => setNovaTurma(false)} onSave={addTurma} />}
          {editandoTurma && <TurmaForm initial={editandoTurma} onCancel={() => setEditandoTurma(null)} onSave={(form) => editarTurma(editandoTurma.id, form)} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.turmas.map((t) => (
              <Card key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.nome}</div>
                  <div style={{ fontSize: 12.5, color: "#5A5648" }}>{formatDias(t.dias)} · {t.horario}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Button variant="ghost" onClick={() => setEditandoTurma(t)}>Editar</Button>
                  <ConfirmDelete onConfirm={() => removerTurma(t.id)} />
                </div>
              </Card>
            ))}
            {data.turmas.length === 0 && <Empty>Nenhuma turma cadastrada ainda.</Empty>}
          </div>
        </div>
      )}

      {tab === "graduacao" && <GraduacaoAdmin data={data} save={save} />}
      {tab === "planos" && <PlanosAdmin data={data} save={save} />}
      {tab === "financeiro" && <FinanceiroAdmin data={data} save={save} />}
      {tab === "config" && <ConfiguracoesAdmin data={data} save={save} />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Icon size={18} color="#C9A227" />
      <div style={{ fontFamily: "Oswald", fontSize: 28, fontWeight: 700, color: "#12213B" }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "#5A5648", fontWeight: 600 }}>{label}</div>
    </Card>
  );
}

function PersonForm({ tipo, initial, planos, faixas, onSave, onCancel }) {
  const i = initial || {};
  const [nome, setNome] = useState(i.nome || "");
  const [email, setEmail] = useState(i.email || "");
  const [telefone, setTelefone] = useState(i.telefone || "");
  const [especialidade, setEspecialidade] = useState(i.especialidade || "");
  const [endereco, setEndereco] = useState(i.endereco || "");
  const [contatoEmergenciaNome, setCEN] = useState(i.contatoEmergenciaNome || "");
  const [contatoEmergenciaTelefone, setCET] = useState(i.contatoEmergenciaTelefone || "");
  const [planoId, setPlanoId] = useState(i.planoId || (planos && planos[0]?.id) || "");
  const [diaVencimento, setDiaVencimento] = useState(i.diaVencimento ?? "");
  const [dataNascimento, setDataNascimento] = useState(i.dataNascimento || "");
  const [faixaId, setFaixaId] = useState(i.faixaId || (faixas && faixas[0]?.id) || "");
  const [grau, setGrau] = useState(i.grau ?? 0);
  const [senha, setSenha] = useState(i.senha || "");
  const [termoAssinadoManual, setTAM] = useState(i.termoAssinadoManual || false);

  const faixaSelecionada = (faixas || []).find((f) => f.id === faixaId);
  const grausMaxSelecionado = faixaSelecionada?.grausMax ?? 0;

  const submit = () => {
    if (!nome.trim()) return;
    if (tipo === "aluno") {
      onSave({
        nome, email, telefone, endereco, contatoEmergenciaNome, contatoEmergenciaTelefone, planoId,
        diaVencimento: diaVencimento === "" ? null : Number(diaVencimento), dataNascimento, faixaId,
        grau: Math.min(Number(grau) || 0, grausMaxSelecionado), senha: senha || randomSenha(), termoAssinadoManual,
      });
    } else {
      onSave({
        nome, email, especialidade, telefone, endereco, faixaId,
        grau: Math.min(Number(grau) || 0, grausMaxSelecionado),
      });
    }
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nome completo"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {tipo === "aluno" ? (
          <>
            <Field label="Telefone"><input style={inputStyle} value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Field>
            <Field label="Endereço"><input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Field>
            <Field label="Contato de emergência (nome)"><input style={inputStyle} value={contatoEmergenciaNome} onChange={(e) => setCEN(e.target.value)} /></Field>
            <Field label="Contato de emergência (telefone)"><input style={inputStyle} value={contatoEmergenciaTelefone} onChange={(e) => setCET(e.target.value)} /></Field>
            <Field label="Data de nascimento"><input type="date" style={inputStyle} value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} /></Field>
            <Field label="Plano">
              <select style={inputStyle} value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
                {(planos || []).map((p) => <option key={p.id} value={p.id}>{p.nome} — R$ {p.valor}</option>)}
              </select>
            </Field>
            <Field label="Dia de vencimento (1-31)"><input type="number" min="1" max="31" style={inputStyle} value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} /></Field>
            <Field label="Faixa">
              <select style={inputStyle} value={faixaId} onChange={(e) => setFaixaId(e.target.value)}>
                {(faixas || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <Field label={`Grau (máx. ${grausMaxSelecionado})`}><input type="number" min="0" max={grausMaxSelecionado} style={inputStyle} value={grau} onChange={(e) => setGrau(e.target.value)} /></Field>
            <Field label="Senha de acesso">
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="será gerada se vazio" />
                <Button variant="ghost" onClick={() => setSenha(randomSenha())}>Gerar</Button>
              </div>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5A5648", marginTop: 22 }}>
              <input type="checkbox" checked={termoAssinadoManual} onChange={(e) => setTAM(e.target.checked)} /> Termo assinado fisicamente
            </label>
          </>
        ) : (
          <>
            <Field label="Telefone / contato"><input style={inputStyle} value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Field>
            <Field label="Endereço"><input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Field>
            <Field label="Especialidade"><input style={inputStyle} value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} /></Field>
            <Field label="Faixa">
              <select style={inputStyle} value={faixaId} onChange={(e) => setFaixaId(e.target.value)}>
                {(faixas || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <Field label={`Grau (máx. ${grausMaxSelecionado})`}><input type="number" min="0" max={grausMaxSelecionado} style={inputStyle} value={grau} onChange={(e) => setGrau(e.target.value)} /></Field>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <ConfirmButton onConfirm={submit}>Salvar</ConfirmButton>
        <Button variant="ghost" icon={X} onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}

function TurmaForm({ initial, onSave, onCancel }) {
  const i = initial || {};
  const [nome, setNome] = useState(i.nome || "");
  const [dias, setDias] = useState(Array.isArray(i.dias) ? i.dias : (i.dias ? String(i.dias).split("/") : []));
  const [horario, setHorario] = useState(i.horario || "");
  const toggleDia = (d) => setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const submit = () => { if (!nome.trim()) return; onSave({ nome, dias, horario }); };
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nome da turma"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Fundamentos" /></Field>
        <Field label="Horário"><input style={inputStyle} value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="19:00" /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Dias da semana">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {DIAS_SEMANA.map((d) => (
              <button key={d} type="button" onClick={() => toggleDia(d)} style={{ padding: "6px 12px", borderRadius: 20, border: dias.includes(d) ? "1px solid #12213B" : "1px solid #D8D3C4", background: dias.includes(d) ? "#12213B" : "#fff", color: dias.includes(d) ? "#fff" : "#5A5648", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{d}</button>
            ))}
          </div>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <ConfirmButton onConfirm={submit}>Salvar</ConfirmButton>
        <Button variant="ghost" icon={X} onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}

function FaixaForm({ onSave, onCancel }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Adulto");
  const [grausMax, setGrausMax] = useState(4);
  const [tempoMinimoAnos, setTempoMinimoAnos] = useState("");
  const [aulasPorGrau, setAulasPorGrau] = useState("");
  const submit = () => { if (!nome.trim()) return; onSave({ nome, categoria, grausMax: Number(grausMax), tempoMinimoAnos: tempoMinimoAnos === "" ? null : Number(tempoMinimoAnos), aulasPorGrau: aulasPorGrau === "" ? null : Number(aulasPorGrau) }); };
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nome da faixa"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="Categoria">
          <select style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option>Infantil</option><option>Adulto</option><option>Mestre</option>
          </select>
        </Field>
        <Field label="Graus máx."><input type="number" min="0" max="10" style={inputStyle} value={grausMax} onChange={(e) => setGrausMax(e.target.value)} /></Field>
        <Field label="Tempo mínimo (anos)"><input type="number" min="0" step="0.5" style={inputStyle} value={tempoMinimoAnos} onChange={(e) => setTempoMinimoAnos(e.target.value)} /></Field>
        <Field label="Aulas por grau"><input type="number" min="0" style={inputStyle} value={aulasPorGrau} onChange={(e) => setAulasPorGrau(e.target.value)} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <ConfirmButton onConfirm={submit}>Salvar</ConfirmButton>
        <Button variant="ghost" icon={X} onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}

function GraduacaoAdmin({ data, save }) {
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState("");
  const moverFaixa = async (idx, dir) => {
    const faixas = [...data.faixas];
    const novoIdx = idx + dir;
    if (novoIdx < 0 || novoIdx >= faixas.length) return;
    [faixas[idx], faixas[novoIdx]] = [faixas[novoIdx], faixas[idx]];
    await save({ ...data, faixas });
  };
  const atualizarFaixa = async (id, campo, valor) => { const faixas = data.faixas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)); await save({ ...data, faixas }); };
  const removerFaixa = async (id) => {
    const emUso = data.alunos.some((a) => a.faixaId === id);
    if (emUso) { setAviso("Não é possível remover: há alunos nesta faixa. Gradue-os para outra faixa antes de remover."); return; }
    setAviso("");
    await save({ ...data, faixas: data.faixas.filter((f) => f.id !== id) });
  };
  const adicionarFaixa = async (form) => { const f = { id: uid(), cor: "#CCCCCC", texto: "#1B2027", borda: "#999999", ...form }; await save({ ...data, faixas: [...data.faixas, f] }); setNovo(false); };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "#5A5648", marginTop: 0 }}>Baseado no sistema de graduação da IBJJF. Edite nomes, cores, graus, tempo mínimo e quantas aulas valem um novo grau. Use as setas para reordenar a sequência.</p>
      {aviso && <div style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, marginBottom: 10 }}>{aviso}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <Button icon={Plus} onClick={() => setNovo(true)}>Nova faixa</Button>
      </div>
      {novo && <FaixaForm onCancel={() => setNovo(false)} onSave={adicionarFaixa} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.faixas.map((f, idx) => (
          <Card key={f.id} style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BeltBar faixas={data.faixas} faixaId={f.id} grau={0} />
                <span style={{ fontSize: 11.5, color: "#8A8574" }}>{f.categoria}</span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => moverFaixa(idx, -1)} style={iconBtnStyle} disabled={idx === 0}>↑</button>
                <button onClick={() => moverFaixa(idx, 1)} style={iconBtnStyle} disabled={idx === data.faixas.length - 1}>↓</button>
                <ConfirmDelete size={14} onConfirm={() => removerFaixa(f.id)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 8, marginTop: 10 }}>
              <Field label="Nome"><input style={inputStyle} value={f.nome} onChange={(e) => atualizarFaixa(f.id, "nome", e.target.value)} /></Field>
              <Field label="Graus máx."><input type="number" min="0" max="10" style={inputStyle} value={f.grausMax} onChange={(e) => atualizarFaixa(f.id, "grausMax", Number(e.target.value))} /></Field>
              <Field label="Tempo mínimo (anos)"><input type="number" min="0" step="0.5" style={inputStyle} value={f.tempoMinimoAnos ?? ""} onChange={(e) => atualizarFaixa(f.id, "tempoMinimoAnos", e.target.value === "" ? null : Number(e.target.value))} /></Field>
              <Field label="Aulas por grau"><input type="number" min="0" style={inputStyle} value={f.aulasPorGrau ?? ""} onChange={(e) => atualizarFaixa(f.id, "aulasPorGrau", e.target.value === "" ? null : Number(e.target.value))} /></Field>
              <Field label="Cor da faixa"><input type="color" style={{ ...inputStyle, padding: 2, height: 36 }} value={f.cor} onChange={(e) => atualizarFaixa(f.id, "cor", e.target.value)} /></Field>
            </div>
            {f.observacoes && <div style={{ fontSize: 11.5, color: "#8A8574", marginTop: 6 }}>{f.observacoes}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlanoForm({ onSave, onCancel }) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [periodicidade, setPeriodicidade] = useState("mensal");
  const submit = () => { if (!nome.trim()) return; onSave({ nome, valor: Number(valor) || 0, periodicidade }); };
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Nome do plano"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="Valor (R$)"><input type="number" min="0" style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
        <Field label="Periodicidade">
          <select style={inputStyle} value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
            <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <ConfirmButton onConfirm={submit}>Salvar</ConfirmButton>
        <Button variant="ghost" icon={X} onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}

function PlanosAdmin({ data, save }) {
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState("");
  const atualizar = async (id, campo, valor) => { const planos = data.planos.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)); await save({ ...data, planos }); };
  const remover = async (id) => {
    const emUso = data.alunos.some((a) => a.planoId === id);
    if (emUso) { setAviso("Não é possível remover: há alunos usando este plano."); return; }
    setAviso("");
    await save({ ...data, planos: data.planos.filter((p) => p.id !== id) });
  };
  const adicionar = async (form) => { const p = { id: uid(), ...form }; await save({ ...data, planos: [...data.planos, p] }); setNovo(false); };
  return (
    <div>
      <p style={{ fontSize: 12.5, color: "#5A5648", marginTop: 0 }}>O status "em dia / pendente" de cada aluno é calculado automaticamente comparando a data do último pagamento e o dia de vencimento com a periodicidade do plano.</p>
      {aviso && <div style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, marginBottom: 10 }}>{aviso}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <Button icon={Plus} onClick={() => setNovo(true)}>Novo plano</Button>
      </div>
      {novo && <PlanoForm onCancel={() => setNovo(false)} onSave={adicionar} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.planos.map((p) => (
          <Card key={p.id} style={{ padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <Field label="Nome"><input style={inputStyle} value={p.nome} onChange={(e) => atualizar(p.id, "nome", e.target.value)} /></Field>
              <Field label="Valor (R$)"><input type="number" style={inputStyle} value={p.valor} onChange={(e) => atualizar(p.id, "valor", Number(e.target.value))} /></Field>
              <Field label="Periodicidade">
                <select style={inputStyle} value={p.periodicidade} onChange={(e) => atualizar(p.id, "periodicidade", e.target.value)}>
                  <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>
                </select>
              </Field>
              <ConfirmDelete onConfirm={() => remover(p.id)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PagamentosChart({ data }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const confirmadosMes = data.alunos.flatMap((a) => (a.pagamentos || []).filter((p) => p.data.slice(0, 7) === mes));
  const totalConfirmado = confirmadosMes.reduce((s, p) => s + (p.valor || 0), 0);
  // Pendente = qualquer aluno em atraso agora, independente do mês selecionado (uma pendência não some se venceu num mês anterior)
  const pendentesAtuais = data.alunos.filter((a) => !statusPagamento(a, data.planos).emDia);
  const totalPendente = pendentesAtuais.reduce((s, a) => s + (data.planos.find((p) => p.id === a.planoId)?.valor || 0), 0);
  const dadosGrafico = [
    { name: "Confirmados no mês", value: confirmadosMes.length, color: "#1E7A34" },
    { name: "Pendentes agora", value: pendentesAtuais.length, color: "#B3261E" },
  ].filter((d) => d.value > 0);

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={blockTitleStyle}>Pagamentos confirmados x pendentes</div>
        <input type="month" style={inputStyle} value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>
      {dadosGrafico.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={dadosGrafico} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name}: ${e.value}`}>
              {dadosGrafico.map((entry, i) => <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <Empty>Sem pagamentos confirmados neste mês nem pendências no momento.</Empty>
      )}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10, paddingTop: 12, borderTop: "1px solid #E7E2D6" }}>
        <div>
          <div style={{ fontSize: 11.5, color: "#8A8574", fontWeight: 600, textTransform: "uppercase" }}>Total confirmado no mês</div>
          <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: "#1E7A34" }}>R$ {totalConfirmado.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "#8A8574", fontWeight: 600, textTransform: "uppercase" }}>Total pendente agora</div>
          <div style={{ fontFamily: "Oswald", fontSize: 22, fontWeight: 700, color: "#B3261E" }}>R$ {totalPendente.toFixed(2)}</div>
        </div>
      </div>
    </Card>
  );
}

function AlunosPorMesChart({ data }) {
  const contagem = {};
  data.alunos.forEach((a) => { if (!a.matricula) return; const chave = a.matricula.slice(0, 7); contagem[chave] = (contagem[chave] || 0) + 1; });
  const chaves = Object.keys(contagem).sort();
  const dados = chaves.map((k) => { const [y, m] = k.split("-"); return { mes: `${m}/${y.slice(2)}`, alunos: contagem[k] }; });
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={blockTitleStyle}>Novos alunos por mês (matrícula)</div>
      {dados.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="alunos" fill="#12213B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty>Sem dados de matrícula suficientes ainda.</Empty>
      )}
    </Card>
  );
}

function FinanceiroAdmin({ data, save }) {
  const darBaixa = async (alunoId) => {
    const alunos = data.alunos.map((a) => {
      if (a.id !== alunoId) return a;
      const plano = data.planos.find((p) => p.id === a.planoId);
      const pagamentos = [...(a.pagamentos || []), { id: uid(), data: hoje(), valor: plano?.valor || 0 }];
      return { ...a, ultimoPagamento: hoje(), pagamentos };
    });
    await save({ ...data, alunos });
  };
  const pendentes = data.alunos.filter((a) => !statusPagamento(a, data.planos).emDia);
  const pagamentosRecentes = data.alunos.flatMap((a) => (a.pagamentos || []).map((p) => ({ ...p, alunoNome: a.nome }))).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 40);

  return (
    <div>
      <PagamentosChart data={data} />

      <div style={blockTitleStyle}>Pagamentos pendentes</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {pendentes.map((a) => {
          const { plano, vencimento } = statusPagamento(a, data.planos);
          return (
            <Card key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome}</div>
                <div style={{ fontSize: 12, color: "#8A8574" }}>{plano?.nome || "sem plano"} · R$ {plano?.valor ?? 0} {vencimento && `· venceu em ${new Date(vencimento + "T00:00:00").toLocaleDateString("pt-BR")}`}</div>
              </div>
              <Button variant="gold" onClick={() => darBaixa(a.id)}>Dar baixa</Button>
            </Card>
          );
        })}
        {pendentes.length === 0 && <Empty>Nenhum pagamento pendente 🎉</Empty>}
      </div>

      <div style={blockTitleStyle}>Pagamentos realizados (recentes)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pagamentosRecentes.map((p, idx) => (
          <Card key={idx} style={{ padding: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.alunoNome}</span>
            <span style={{ fontSize: 13, color: "#5A5648" }}>R$ {p.valor} · {new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
          </Card>
        ))}
        {pagamentosRecentes.length === 0 && <Empty>Nenhum pagamento registrado ainda.</Empty>}
      </div>
    </div>
  );
}

function ConfiguracoesAdmin({ data, save }) {
  const [nome, setNome] = useState(data.academia.nome);
  const [chavePix, setChavePix] = useState(data.academia.chavePix || "");
  const [termo, setTermo] = useState(data.academia.termoPadrao || "");
  const [logo, setLogo] = useState(data.academia.logo || null);
  const [termoPdf, setTermoPdf] = useState(data.academia.termoPdf || null);
  const [termoPdfNome, setTermoPdfNome] = useState(data.academia.termoPdfNome || "");
  const [senhaAdmin, setSenhaAdmin] = useState(data.academia.senhaAdmin || "");
  const logoRef = useRef(null);
  const pdfRef = useRef(null);

  const onLogo = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setLogo(r.result); r.readAsDataURL(f); };
  const onPdf = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setTermoPdf(r.result); setTermoPdfNome(f.name); }; r.readAsDataURL(f); };
  const salvar = async () => { await save({ ...data, academia: { ...data.academia, nome, chavePix, termoPadrao: termo, logo, termoPdf, termoPdfNome, senhaAdmin } }); };

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Logo da equipe">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logo ? <img src={logo} alt="logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", border: "1px solid #E7E2D6" }} /> : <div style={{ width: 56, height: 56, borderRadius: 10, background: "#EDE8DC" }} />}
            <Button variant="ghost" icon={Camera} onClick={() => logoRef.current?.click()}>Enviar logo</Button>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
          </div>
        </Field>
        <Field label="Nome da academia/equipe"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="Chave PIX para pagamentos"><input style={inputStyle} value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="ex: e-mail, telefone ou chave aleatória" /></Field>
        <Field label="Senha de acesso ao painel administrador"><input style={inputStyle} value={senhaAdmin} onChange={(e) => setSenhaAdmin(e.target.value)} /></Field>
        <Field label="Termo de consentimento (texto exibido no app)">
          <textarea style={{ ...inputStyle, minHeight: 120, fontFamily: "Inter", resize: "vertical" }} value={termo} onChange={(e) => setTermo(e.target.value)} />
        </Field>
        <Field label="Termo de consentimento (arquivo PDF, opcional)">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button variant="ghost" onClick={() => pdfRef.current?.click()}>{termoPdf ? "Trocar PDF" : "Enviar PDF"}</Button>
            <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={onPdf} />
            {termoPdfNome && <span style={{ fontSize: 12.5, color: "#5A5648" }}>{termoPdfNome}</span>}
          </div>
        </Field>
        <div><ConfirmButton onConfirm={salvar}>Salvar configurações</ConfirmButton></div>
      </div>
    </Card>
  );
}

/* ---------------- PROFESSOR ---------------- */
function ProfessorView({ data, save, activeProfId, setActiveProfId }) {
  const prof = data.professores.find((p) => p.id === activeProfId);
  if (!prof) {
    return (
      <div>
        <SectionTitle sub="Selecione seu usuário para entrar como professor">Área do professor</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.professores.map((p) => (
            <Card key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer" }}>
              <div onClick={() => setActiveProfId(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <Avatar foto={null} nome={p.nome} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
              </div>
              <ChevronRight size={16} color="#8A8574" onClick={() => setActiveProfId(p.id)} />
            </Card>
          ))}
          {data.professores.length === 0 && <Empty>Nenhum professor cadastrado. Peça à administração para te cadastrar.</Empty>}
        </div>
      </div>
    );
  }
  return <ProfessorDashboard data={data} save={save} prof={prof} onSair={() => setActiveProfId(null)} />;
}

function ProfessorDashboard({ data, save, prof, onSair }) {
  const [turmaId, setTurmaId] = useState(data.turmas[0]?.id || "");
  const sessaoAtiva = data.sessoes.find((s) => s.professorId === prof.id && s.ativa);

  const gerarQr = async () => {
    if (!turmaId) return;
    const codigo = randomCode();
    const sessao = { id: uid(), treinoId: turmaId, professorId: prof.id, codigo, criadoEm: new Date().toISOString(), ativa: true };
    const sessoes = data.sessoes.map((s) => (s.professorId === prof.id ? { ...s, ativa: false } : s));
    await save({ ...data, sessoes: [...sessoes, sessao] });
  };
  const encerrarSessao = async () => { const sessoes = data.sessoes.map((s) => (s.id === sessaoAtiva.id ? { ...s, ativa: false } : s)); await save({ ...data, sessoes }); };
  const graduar = async (alunoId, tipo) => {
    const alunos = data.alunos.map((a) => {
      if (a.id !== alunoId) return a;
      const idx = data.faixas.findIndex((f) => f.id === a.faixaId);
      const faixaAtual = data.faixas[idx] || data.faixas[0];
      if (tipo === "grau") {
        if (!faixaAtual.grausMax) return a;
        return { ...a, grau: Math.min(a.grau + 1, faixaAtual.grausMax), checkinsDesdeGraduacao: 0 };
      }
      const proxima = data.faixas[idx + 1];
      if (!proxima) return a;
      return { ...a, faixaId: proxima.id, grau: 0, checkinsDesdeGraduacao: 0 };
    });
    await save({ ...data, alunos });
  };
  const darBaixaPagamento = async (alunoId) => {
    const alunos = data.alunos.map((a) => {
      if (a.id !== alunoId) return a;
      const plano = data.planos.find((p) => p.id === a.planoId);
      const pagamentos = [...(a.pagamentos || []), { id: uid(), data: hoje(), valor: plano?.valor || 0 }];
      return { ...a, ultimoPagamento: hoje(), pagamentos };
    });
    await save({ ...data, alunos });
  };

  const checkinsSessao = sessaoAtiva ? data.checkins.filter((c) => c.sessaoId === sessaoAtiva.id) : [];
  const turma = data.turmas.find((t) => t.id === turmaId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SectionTitle sub={`Logado como professor · ${prof.nome}`}>Área do professor</SectionTitle>
        <Button variant="ghost" icon={LogOut} onClick={onSair}>Trocar usuário</Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={blockTitleStyle}>Check-in da aula</div>
        {!sessaoAtiva ? (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Selecionar treino">
              <select style={inputStyle} value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                {data.turmas.map((t) => <option key={t.id} value={t.id}>{t.nome} — {t.horario}</option>)}
              </select>
            </Field>
            <Button icon={QrCode} variant="gold" onClick={gerarQr}>Gerar QR code</Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <img alt="QR code de check-in" width={160} height={160} style={{ borderRadius: 8, border: "1px solid #E7E2D6" }} src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${sessaoAtiva.codigo}`} />
            <div>
              <div style={{ fontSize: 13, color: "#5A5648", marginBottom: 4 }}>Treino ativo</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{turma?.nome}</div>
              <div style={{ fontSize: 12.5, color: "#5A5648", marginBottom: 10 }}>Código: <b>{sessaoAtiva.codigo}</b> (o aluno também pode digitar este código no lugar de escanear)</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{checkinsSessao.length} aluno(s) fizeram check-in</div>
              <Button variant="danger" onClick={encerrarSessao}>Encerrar sessão</Button>
            </div>
          </div>
        )}
      </Card>

      <div style={{ ...blockTitleStyle, margin: "18px 0 10px" }}>Alunos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.alunos.map((a) => {
          const { emDia, plano } = statusPagamento(a, data.planos);
          const idx = data.faixas.findIndex((f) => f.id === a.faixaId);
          const faixaAtual = data.faixas[idx] || data.faixas[0];
          return (
            <Card key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar foto={a.foto} nome={a.nome} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome}</div>
                  <BeltBar faixas={data.faixas} faixaId={a.faixaId} grau={a.grau} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "#8A8574" }}>{plano?.nome || "sem plano"}</span>
                <Tag ok={emDia}>{emDia ? "Em dia" : "Pendente"}</Tag>
                {!emDia && <Button variant="gold" onClick={() => darBaixaPagamento(a.id)}>Dar baixa</Button>}
                {faixaAtual?.grausMax > 0 && <Button variant="ghost" onClick={() => graduar(a.id, "grau")} disabled={a.grau >= faixaAtual.grausMax}>+1 grau</Button>}
                <Button variant="ghost" onClick={() => graduar(a.id, "faixa")} disabled={idx >= data.faixas.length - 1}>Graduar faixa</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- ALUNO ---------------- */
function AlunoLogin({ data, save, onLogin }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [modoReset, setModoReset] = useState(false);
  const [emailReset, setEmailReset] = useState("");
  const [msgReset, setMsgReset] = useState("");

  const entrar = () => {
    const aluno = data.alunos.find((a) => a.email && a.email.toLowerCase() === email.trim().toLowerCase() && a.senha === senha);
    if (!aluno) { setErro("E-mail ou senha incorretos."); return; }
    setErro("");
    onLogin(aluno.id);
  };

  const resetar = async () => {
    const aluno = data.alunos.find((a) => a.email && a.email.toLowerCase() === emailReset.trim().toLowerCase());
    if (!aluno) { setMsgReset("Não encontramos esse e-mail cadastrado."); return; }
    const nova = randomSenha();
    const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, senha: nova } : a));
    await save({ ...data, alunos });
    setMsgReset(`Senha redefinida! Nova senha: ${nova}. (Envio automático por e-mail ainda não está configurado — anote e repasse ao aluno.)`);
  };

  return (
    <div style={{ maxWidth: 380, margin: "30px auto" }}>
      <SectionTitle sub="Faça login para acessar sua área">Área do aluno</SectionTitle>
      <Card>
        {!modoReset ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Senha"><input type="password" style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
            {erro && <div style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600 }}>{erro}</div>}
            <Button icon={Check} onClick={entrar}>Entrar</Button>
            <button onClick={() => { setModoReset(true); setMsgReset(""); }} style={{ background: "none", border: "none", color: "#12213B", fontSize: 12.5, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}>Esqueci minha senha</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Informe seu e-mail cadastrado"><input style={inputStyle} value={emailReset} onChange={(e) => setEmailReset(e.target.value)} /></Field>
            <Button icon={Check} variant="gold" onClick={resetar}>Redefinir senha</Button>
            {msgReset && <div style={{ fontSize: 12.5, color: "#5A5648" }}>{msgReset}</div>}
            <button onClick={() => setModoReset(false)} style={{ background: "none", border: "none", color: "#12213B", fontSize: 12.5, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}>Voltar ao login</button>
          </div>
        )}
      </Card>
      <p style={{ fontSize: 11.5, color: "#8A8574", marginTop: 10 }}>Não tem acesso ainda? Peça ao professor ou à administração para te cadastrar.</p>
    </div>
  );
}

function PrimeiroAcessoTermo({ data, save, aluno }) {
  const [aceito, setAceito] = useState(false);
  const confirmar = async () => {
    if (!aceito) return;
    const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, termoAceito: true, termoAceitoEm: new Date().toISOString(), primeiroAcesso: false } : a));
    await save({ ...data, alunos });
  };
  return (
    <div style={{ maxWidth: 480, margin: "20px auto" }}>
      <SectionTitle sub={`Bem-vindo(a), ${aluno.nome}! Antes de continuar, leia o termo abaixo.`}>Primeiro acesso</SectionTitle>
      <Card>
        {data.academia.termoPdf && (
          <a href={data.academia.termoPdf} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#12213B", marginBottom: 10 }}>
            📄 Abrir termo em PDF ({data.academia.termoPdfNome || "termo.pdf"})
          </a>
        )}
        {data.academia.termoPadrao && (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "#5A5648", maxHeight: 180, overflowY: "auto", border: "1px solid #E7E2D6", borderRadius: 8, padding: 10, marginBottom: 10 }}>{data.academia.termoPadrao}</div>
        )}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} style={{ marginTop: 3 }} />
          Li o termo de consentimento (texto e/ou PDF) e estou ciente das condições.
        </label>
        <Button icon={Check} variant="gold" disabled={!aceito} onClick={confirmar}>Continuar</Button>
      </Card>
    </div>
  );
}

function AlunoView({ data, save, activeAlunoId, setActiveAlunoId }) {
  const aluno = data.alunos.find((a) => a.id === activeAlunoId);
  if (!aluno) return <AlunoLogin data={data} save={save} onLogin={setActiveAlunoId} />;
  if (aluno.primeiroAcesso && (data.academia.termoPadrao || data.academia.termoPdf)) return <PrimeiroAcessoTermo data={data} save={save} aluno={aluno} />;
  return <AlunoDashboard data={data} save={save} aluno={aluno} onSair={() => setActiveAlunoId(null)} />;
}

function AlunoDashboard({ data, save, aluno, onSair }) {
  const fileRef = useRef(null);
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState("");
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(aluno.nome);
  const [email, setEmail] = useState(aluno.email || "");
  const [telefone, setTelefone] = useState(aluno.telefone || "");
  const [endereco, setEndereco] = useState(aluno.endereco || "");
  const [cen, setCen] = useState(aluno.contatoEmergenciaNome || "");
  const [cet, setCet] = useState(aluno.contatoEmergenciaTelefone || "");

  const meusCheckins = data.checkins.filter((c) => c.alunoId === aluno.id).sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  const { emDia, vencimento, plano } = statusPagamento(aluno, data.planos);
  const faixaAtual = data.faixas.find((f) => f.id === aluno.faixaId);

  const salvarPerfil = async () => {
    const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, nome, email, telefone, endereco, contatoEmergenciaNome: cen, contatoEmergenciaTelefone: cet } : a));
    await save({ ...data, alunos });
    setEditando(false);
  };

  const onFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, foto: reader.result } : a)); await save({ ...data, alunos }); };
    reader.readAsDataURL(file);
  };

  const fazerCheckin = async () => {
    setMsg("");
    const sessao = data.sessoes.find((s) => s.codigo === codigo.trim().toUpperCase() && s.ativa);
    if (!sessao) { setMsg("Código inválido ou nenhuma sessão ativa com esse código."); return; }
    const jaFez = data.checkins.some((c) => c.sessaoId === sessao.id && c.alunoId === aluno.id);
    if (jaFez) { setMsg("Você já fez check-in nesta aula."); return; }
    const checkin = { id: uid(), sessaoId: sessao.id, alunoId: aluno.id, dataHora: new Date().toISOString() };
    const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, checkinsDesdeGraduacao: (a.checkinsDesdeGraduacao || 0) + 1 } : a));
    await save({ ...data, checkins: [...data.checkins, checkin], alunos });
    setCodigo("");
    setMsg("Check-in confirmado! Bom treino 🥋");
  };

  const aceitarTermo = async () => { const alunos = data.alunos.map((a) => (a.id === aluno.id ? { ...a, termoAceito: true, termoAceitoEm: new Date().toISOString() } : a)); await save({ ...data, alunos }); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SectionTitle sub={`Logado como aluno · ${aluno.nome}`}>Área do aluno</SectionTitle>
        <Button variant="ghost" icon={LogOut} onClick={onSair}>Sair</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginBottom: 14 }}>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <div style={{ position: "relative" }}>
            <Avatar foto={aluno.foto} nome={aluno.nome} size={84} />
            <button onClick={() => fileRef.current?.click()} style={{ position: "absolute", bottom: -2, right: -2, background: "#C9A227", border: "2px solid #fff", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Camera size={14} color="#17181B" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFoto} />
          </div>
          {!editando ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{aluno.nome}</div>
              <div style={{ fontSize: 12.5, color: "#5A5648" }}>{aluno.email || "sem e-mail"} {aluno.telefone && `· ${aluno.telefone}`}</div>
              {aluno.endereco && <div style={{ fontSize: 11.5, color: "#8A8574" }}>{aluno.endereco}</div>}
              {aluno.contatoEmergenciaNome && <div style={{ fontSize: 11.5, color: "#8A8574" }}>Emergência: {aluno.contatoEmergenciaNome} · {aluno.contatoEmergenciaTelefone}</div>}
              <BeltBar faixas={data.faixas} faixaId={aluno.faixaId} grau={aluno.grau} size="lg" />
              {faixaAtual?.aulasPorGrau ? (
                <div style={{ fontSize: 12, color: "#5A5648" }}>Faltam <b>{Math.max(0, faixaAtual.aulasPorGrau - (aluno.checkinsDesdeGraduacao || 0))}</b> aula(s) para o próximo grau</div>
              ) : (
                <div style={{ fontSize: 11.5, color: "#8A8574" }}>Critério de aulas por grau ainda não definido pelo professor</div>
              )}
              <Button variant="ghost" onClick={() => setEditando(true)}>Editar dados</Button>
            </>
          ) : (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              <Field label="Nome"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
              <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Telefone"><input style={inputStyle} value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Field>
              <Field label="Endereço"><input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Field>
              <Field label="Contato de emergência (nome)"><input style={inputStyle} value={cen} onChange={(e) => setCen(e.target.value)} /></Field>
              <Field label="Contato de emergência (telefone)"><input style={inputStyle} value={cet} onChange={(e) => setCet(e.target.value)} /></Field>
              <div style={{ display: "flex", gap: 8 }}>
                <ConfirmButton onConfirm={salvarPerfil}>Salvar</ConfirmButton>
                <Button variant="ghost" icon={X} onClick={() => setEditando(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div style={blockTitleStyle}>Fazer check-in</div>
          <p style={{ fontSize: 12.5, color: "#5A5648", marginTop: 0 }}>Digite o código mostrado pelo professor no telão/QR code da aula de hoje.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1, textTransform: "uppercase" }} placeholder="CÓDIGO DA AULA" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <Button icon={QrCode} variant="gold" onClick={fazerCheckin}>Check-in</Button>
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: msg.includes("confirmado") ? "#1E7A34" : "#B3261E" }}>{msg}</div>}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E7E2D6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Plano: {plano?.nome || "—"}</div>
              <Tag ok={emDia}>{emDia ? "Em dia" : "Pendente"}</Tag>
            </div>
            {plano && <div style={{ fontSize: 12, color: "#8A8574", marginTop: 4 }}>R$ {plano.valor} · {plano.periodicidade}</div>}
            {vencimento && <div style={{ fontSize: 12, color: "#8A8574" }}>Próximo vencimento: {new Date(vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</div>}
          </div>
        </Card>
      </div>

      {(data.academia.termoPadrao || data.academia.termoPdf) && (
        <Card style={{ marginBottom: 14 }}>
          <div style={blockTitleStyle}>Termo de consentimento</div>
          {data.academia.termoPdf && (
            <a href={data.academia.termoPdf} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#12213B", marginBottom: 10 }}>
              📄 Abrir termo em PDF ({data.academia.termoPdfNome || "termo.pdf"})
            </a>
          )}
          {aluno.termoAceito ? (
            <div style={{ fontSize: 13, color: "#1E7A34", fontWeight: 600 }}>Aceito em {new Date(aluno.termoAceitoEm).toLocaleDateString("pt-BR")}</div>
          ) : aluno.termoAssinadoManual ? (
            <div style={{ fontSize: 13, color: "#5A5648" }}>Assinado fisicamente (registrado pela administração).</div>
          ) : (
            <>
              {data.academia.termoPadrao && <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "#5A5648", maxHeight: 140, overflowY: "auto", border: "1px solid #E7E2D6", borderRadius: 8, padding: 10, marginBottom: 10 }}>{data.academia.termoPadrao}</div>}
              <Button icon={Check} variant="gold" onClick={aceitarTermo}>Li e aceito o termo</Button>
            </>
          )}
        </Card>
      )}

      <div style={{ ...blockTitleStyle, margin: "18px 0 10px" }}>Histórico de treinos</div>
      <Card>
        {meusCheckins.length === 0 ? (
          <Empty>Nenhum check-in registrado ainda.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {meusCheckins.map((c) => {
              const sessao = data.sessoes.find((s) => s.id === c.sessaoId);
              const turma = sessao && data.turmas.find((t) => t.id === sessao.treinoId);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                  <CalendarCheck size={15} color="#C9A227" />
                  <span style={{ fontWeight: 600 }}>{turma?.nome || "Treino"}</span>
                  <span style={{ color: "#8A8574" }}>{new Date(c.dataHora).toLocaleString("pt-BR")}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
