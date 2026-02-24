import { useState, useEffect, useMemo } from 'react';
import {
    DollarSign, Plus, ArrowUpRight, ArrowDownRight, Paperclip, CheckCircle2,
    Users, ChevronDown, ChevronUp, Calendar, Filter, Edit2, Trash2
} from 'lucide-react';
import {
    collection, addDoc, getDocs, query, where, Timestamp, deleteDoc, doc, updateDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../services/firebaseConfig';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = 'geral' | 'clientes';
type Categoria = 'Comércio' | 'Indústria' | 'Serviços';

interface Lancamento {
    id: string;
    descricao: string;
    valor: number;
    tipo: 'Receita' | 'Despesa';
    data: string;
    hasNf: boolean;
    nfUrl?: string;
    clienteId: string;
    clienteNome: string;
    categoria?: Categoria;
    createdAt: Timestamp;
    userId: string;
}

interface FormLancamento {
    descricao: string;
    valor: number;
    tipo: 'Receita' | 'Despesa';
    data: string;
    hasNf: boolean;
    clienteId: string;
    categoria: Categoria;
    nfFile?: FileList;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Financeiro() {
    const meses: { value: string; label: string }[] = [
        { value: '01', label: 'Janeiro' },
        { value: '02', label: 'Fevereiro' },
        { value: '03', label: 'Março' },
        { value: '04', label: 'Abril' },
        { value: '05', label: 'Maio' },
        { value: '06', label: 'Junho' },
        { value: '07', label: 'Julho' },
        { value: '08', label: 'Agosto' },
        { value: '09', label: 'Setembro' },
        { value: '10', label: 'Outubro' },
        { value: '11', label: 'Novembro' },
        { value: '12', label: 'Dezembro' },
    ];

    // ── State ──────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TabType>('geral');
    const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
    const [clientes, setClientes] = useState<{ id: string; nomeFantasia: string }[]>([]);
    const [expandedCliente, setExpandedCliente] = useState<string | null>(null);

    const [filterMes, setFilterMes] = useState('');
    const [filterAno, setFilterAno] = useState('');
    const [filterCliente, setFilterCliente] = useState('');

    const [isLancamentoModalOpen, setIsLancamentoModalOpen] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Lancamento } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Lancamento | null>(null);

    const { currentUser } = useAuth();

    // ── Forms ──────────────────────────────────────────────────────────────
    const lancamentoForm = useForm<FormLancamento>({
        defaultValues: { tipo: 'Receita', hasNf: false, data: new Date().toISOString().split('T')[0], clienteId: '', categoria: 'Serviços' }
    });

    const watchHasNf = lancamentoForm.watch('hasNf');
    const watchTipo = lancamentoForm.watch('tipo');

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchClientes = async () => {
        if (!currentUser) return;
        try {
            const q = query(
                collection(db, 'clientes'),
                where('userId', '==', currentUser.uid),
                where('status', '==', 'Ativo')
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, nomeFantasia: d.data().nomeFantasia as string }));
            data.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia));
            setClientes(data);
        } catch (e) { console.error('Erro ao buscar clientes:', e); }
    };

    const fetchLancamentos = async () => {
        if (!currentUser) return;
        try {
            const q = query(collection(db, 'financeiro'), where('userId', '==', currentUser.uid));
            const snap = await getDocs(q);
            let data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Lancamento[];
            data = data.sort((a, b) =>
                new Date(b.data + 'T12:00:00').getTime() - new Date(a.data + 'T12:00:00').getTime()
            );
            setLancamentos(data);
        } catch (e) { console.error('Erro ao buscar lançamentos:', e); }
    };

    useEffect(() => {
        fetchClientes();
        fetchLancamentos();
    }, [currentUser]);

    useEffect(() => {
        const close = () => setContextMenu(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, []);

    // ── Dados computados ───────────────────────────────────────────────────
    const anosDisponiveis = useMemo(() => {
        const currentYear = String(new Date().getFullYear());
        const years = new Set(lancamentos.map(l => l.data.slice(0, 4)).filter(Boolean));
        years.add(currentYear);
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [lancamentos]);

    const periodoSelecionadoLabel = useMemo(() => {
        const mesSelecionado = meses.find(m => m.value === filterMes)?.label;
        if (mesSelecionado && filterAno) return `${mesSelecionado}/${filterAno}`;
        if (mesSelecionado) return mesSelecionado;
        if (filterAno) return filterAno;
        return '';
    }, [filterMes, filterAno, meses]);

    const filteredLancamentos = useMemo(() => {
        return lancamentos.filter(l => {
            const mesMatch = filterMes ? l.data.slice(5, 7) === filterMes : true;
            const anoMatch = filterAno ? l.data.slice(0, 4) === filterAno : true;
            const clienteMatch = filterCliente ? l.clienteId === filterCliente : true;
            return mesMatch && anoMatch && clienteMatch;
        });
    }, [lancamentos, filterMes, filterAno, filterCliente]);

    const totalReceitas = filteredLancamentos.filter(l => l.tipo === 'Receita').reduce((a, b) => a + b.valor, 0);
    const totalDespesas = filteredLancamentos.filter(l => l.tipo === 'Despesa').reduce((a, b) => a + b.valor, 0);
    const saldo = totalReceitas - totalDespesas;

    const lancamentosByCliente = useMemo(() => {
        const map = new Map<string, { nomeFantasia: string; receitas: number; despesas: number; items: Lancamento[] }>();
        lancamentos.forEach(l => {
            if (!map.has(l.clienteId)) {
                map.set(l.clienteId, { nomeFantasia: l.clienteNome, receitas: 0, despesas: 0, items: [] });
            }
            const entry = map.get(l.clienteId)!;
            entry.items.push(l);
            if (l.tipo === 'Receita') entry.receitas += l.valor;
            else entry.despesas += l.valor;
        });
        return Array.from(map.entries())
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia));
    }, [lancamentos]);

    // ── Handlers: Lançamento ──────────────────────────────────────────────
    const handleCloseLancamentoModal = () => {
        setIsLancamentoModalOpen(false);
        setEditingLancamento(null);
        lancamentoForm.reset({ tipo: 'Receita', hasNf: false, data: new Date().toISOString().split('T')[0], clienteId: '', categoria: 'Serviços' });
    };

    const handleEditLancamento = (item: Lancamento) => {
        setContextMenu(null);
        setEditingLancamento(item);
        lancamentoForm.reset({
            tipo: item.tipo,
            hasNf: item.hasNf,
            data: item.data,
            clienteId: item.clienteId,
            categoria: item.categoria ?? 'Serviços',
            descricao: item.descricao,
            valor: item.valor,
        });
        setIsLancamentoModalOpen(true);
    };

    const handleDeleteLancamento = async () => {
        if (!confirmDelete) return;
        try {
            await deleteDoc(doc(db, 'financeiro', confirmDelete.id));
            setConfirmDelete(null);
            fetchLancamentos();
        } catch (e) {
            console.error(e);
            alert('Erro ao excluir lançamento.');
        }
    };

    // ── Submit: Lançamento ─────────────────────────────────────────────────
    const onSubmitLancamento = async (data: FormLancamento) => {
        if (!currentUser) return;
        setUploadingImage(true);
        let url = editingLancamento?.nfUrl ?? '';
        try {
            if (data.hasNf && data.nfFile && data.nfFile.length > 0) {
                const file = data.nfFile[0];
                const storageRef = ref(storage, `notas_fiscais/${currentUser.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                url = await getDownloadURL(snapshot.ref);
            } else if (!data.hasNf) {
                url = '';
            }
            const clienteSelecionado = clientes.find(c => c.id === data.clienteId);
            const payload = {
                descricao: data.descricao,
                valor: Number(data.valor),
                tipo: data.tipo,
                data: data.data,
                hasNf: data.hasNf,
                nfUrl: url || null,
                clienteId: data.clienteId,
                clienteNome: clienteSelecionado?.nomeFantasia ?? 'Sem Vínculo',
                categoria: data.categoria,
                userId: currentUser.uid,
            };
            if (editingLancamento) {
                await updateDoc(doc(db, 'financeiro', editingLancamento.id), payload);
            } else {
                await addDoc(collection(db, 'financeiro'), { ...payload, createdAt: Timestamp.now() });
            }
            handleCloseLancamentoModal();
            fetchLancamentos();
        } catch (e) {
            console.error(e);
            alert('Erro ao salvar lançamento financeiro.');
        } finally {
            setUploadingImage(false);
        }
    };

    // ── Tabs ───────────────────────────────────────────────────────────────
    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: 'geral', label: 'Visão Geral', icon: <DollarSign className="w-4 h-4" /> },
        { id: 'clientes', label: 'Por Cliente', icon: <Users className="w-4 h-4" /> },
    ];

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Cards Resumo */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">
                                Saldo{periodoSelecionadoLabel ? ` — ${periodoSelecionadoLabel}` : ''}
                            </p>
                            <h3 className={`text-3xl font-bold tracking-tight ${saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                R$ {saldo.toFixed(2)}
                            </h3>
                        </div>
                        <div className={`p-4 rounded-2xl ${saldo >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            <DollarSign className="w-8 h-8" />
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Receitas</p>
                            <h3 className="text-xl font-bold tracking-tight text-slate-800">R$ {totalReceitas.toFixed(2)}</h3>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600"><ArrowUpRight className="w-6 h-6" /></div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Despesas</p>
                            <h3 className="text-xl font-bold tracking-tight text-slate-800">R$ {totalDespesas.toFixed(2)}</h3>
                        </div>
                        <div className="p-3 rounded-xl bg-rose-50 text-rose-600"><ArrowDownRight className="w-6 h-6" /></div>
                    </div>
                </div>

                {/* Painel com Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

                    {/* Barra de tabs */}
                    <div className="flex items-center justify-between px-6 pt-4 border-b border-slate-100">
                        <div className="flex gap-1">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px cursor-pointer ${activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {tab.icon}{tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="pb-3">
                            <button
                                onClick={() => setIsLancamentoModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium shadow-sm shadow-blue-500/30 transition flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Plus className="w-4 h-4" /> Novo Lançamento
                            </button>
                        </div>
                    </div>

                    {/* ── Tab: Visão Geral ── */}
                    {activeTab === 'geral' && (
                        <div>
                            <div className="flex flex-wrap items-center gap-3 px-6 py-3.5 bg-slate-50/60 border-b border-slate-100">
                                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    <select
                                        value={filterMes}
                                        onChange={e => setFilterMes(e.target.value)}
                                        className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
                                    >
                                        <option value="">Ver todos os meses</option>
                                        {meses.map(mes => <option key={mes.value} value={mes.value}>{mes.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    <select
                                        value={filterAno}
                                        onChange={e => setFilterAno(e.target.value)}
                                        className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
                                    >
                                        <option value="">Ver todos os anos</option>
                                        {anosDisponiveis.map(ano => <option key={ano} value={ano}>{ano}</option>)}
                                    </select>
                                </div>
                                <select
                                    value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none cursor-pointer"
                                >
                                    <option value="">Todos os clientes</option>
                                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
                                </select>
                                {(filterMes || filterAno || filterCliente) && (
                                    <button onClick={() => { setFilterMes(''); setFilterAno(''); setFilterCliente(''); }} className="text-xs text-blue-600 hover:underline cursor-pointer">
                                        Limpar filtros
                                    </button>
                                )}
                                <span className="ml-auto text-xs text-slate-400">{filteredLancamentos.length} registro(s)</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-600">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Data</th>
                                            <th className="px-6 py-3">Descrição</th>
                                            <th className="px-6 py-3">Cliente</th>
                                            <th className="px-6 py-3">Categoria</th>
                                            <th className="px-6 py-3">Tipo</th>
                                            <th className="px-6 py-3 text-right">Valor</th>
                                            <th className="px-6 py-3 text-center">NF</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredLancamentos.length === 0 ? (
                                            <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">Nenhuma movimentação para os filtros selecionados.</td></tr>
                                        ) : filteredLancamentos.map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors select-none" onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item }); }}>
                                                <td className="px-6 py-3.5 whitespace-nowrap text-slate-500">{format(new Date(item.data + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                                <td className="px-6 py-3.5 font-medium text-slate-800">{item.descricao}</td>
                                                <td className="px-6 py-3.5">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-medium">{item.clienteNome || 'Sem Vínculo'}</span>
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    {item.categoria ? (
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${
                                                            item.categoria === 'Comércio' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            item.categoria === 'Indústria' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            'bg-violet-50 text-violet-700 border-violet-200'
                                                        }`}>{item.categoria}</span>
                                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <span className={`flex items-center gap-1.5 text-sm font-medium ${item.tipo === 'Receita' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {item.tipo === 'Receita' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                                        {item.tipo}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 text-right font-semibold text-slate-800">R$ {item.valor.toFixed(2)}</td>
                                                <td className="px-6 py-3.5 text-center">
                                                    {item.hasNf && item.nfUrl
                                                        ? <a href={item.nfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg text-xs font-medium"><Paperclip className="w-3.5 h-3.5" /> Ver</a>
                                                        : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Tab: Por Cliente ── */}
                    {activeTab === 'clientes' && (
                        <div className="divide-y divide-slate-100">
                            {lancamentosByCliente.length === 0 ? (
                                <p className="px-6 py-12 text-center text-slate-400">Nenhum lançamento cadastrado ainda.</p>
                            ) : lancamentosByCliente.map(grupo => {
                                const saldoGrupo = grupo.receitas - grupo.despesas;
                                const isOpen = expandedCliente === grupo.id;
                                return (
                                    <div key={grupo.id}>
                                        <button
                                            onClick={() => setExpandedCliente(isOpen ? null : grupo.id)}
                                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                                                    {grupo.nomeFantasia.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm">{grupo.nomeFantasia}</p>
                                                    <p className="text-xs text-slate-400">{grupo.items.length} lançamento(s)</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-xs text-slate-400">Receitas</p>
                                                    <p className="text-sm font-semibold text-emerald-600">R$ {grupo.receitas.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-xs text-slate-400">Despesas</p>
                                                    <p className="text-sm font-semibold text-rose-600">R$ {grupo.despesas.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-slate-400">Saldo</p>
                                                    <p className={`text-sm font-bold ${saldoGrupo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>R$ {saldoGrupo.toFixed(2)}</p>
                                                </div>
                                                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                            </div>
                                        </button>
                                        {isOpen && (
                                            <div className="bg-slate-50/60 border-t border-slate-100">
                                                <table className="w-full text-sm text-slate-600">
                                                    <thead>
                                                        <tr className="text-[11px] uppercase font-semibold text-slate-400 border-b border-slate-100">
                                                            <th className="px-8 py-2 text-left">Data</th>
                                                            <th className="px-6 py-2 text-left">Descrição</th>
                                                            <th className="px-6 py-2 text-left">Tipo</th>
                                                            <th className="px-6 py-2 text-right">Valor</th>
                                                            <th className="px-6 py-2 text-center">NF</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {grupo.items
                                                            .sort((a, b) => new Date(b.data + 'T12:00:00').getTime() - new Date(a.data + 'T12:00:00').getTime())
                                                            .map(item => (
                                                                <tr key={item.id} className="hover:bg-white transition-colors select-none" onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item }); }}>
                                                                    <td className="px-8 py-2.5 text-slate-400 whitespace-nowrap">{format(new Date(item.data + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                                                    <td className="px-6 py-2.5 font-medium text-slate-700">{item.descricao}</td>
                                                                    <td className="px-6 py-2.5">
                                                                        <span className={`flex items-center gap-1 text-xs font-semibold ${item.tipo === 'Receita' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                            {item.tipo === 'Receita' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                                                            {item.tipo}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-2.5 text-right font-bold text-slate-800">R$ {item.valor.toFixed(2)}</td>
                                                                    <td className="px-6 py-2.5 text-center">
                                                                        {item.hasNf && item.nfUrl
                                                                            ? <a href={item.nfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs font-medium"><Paperclip className="w-3 h-3" /> Ver</a>
                                                                            : <span className="text-slate-300 text-xs">—</span>}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>
            </div>

            {/* Modal: Novo Lançamento */}
            {isLancamentoModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{editingLancamento ? 'Editar Lançamento' : 'Registrar Movimentação'}</h2>
                                {editingLancamento && <p className="text-xs text-slate-400 mt-0.5">{editingLancamento.descricao}</p>}
                            </div>
                            <button onClick={handleCloseLancamentoModal} className="text-slate-400 hover:text-slate-600 p-2 bg-white rounded-full shadow-sm cursor-pointer">✕</button>
                        </div>
                        <form onSubmit={lancamentoForm.handleSubmit(onSubmitLancamento)} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`cursor-pointer border-2 rounded-xl p-3.5 text-center transition-all ${watchTipo === 'Receita' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-100 text-slate-500'}`}>
                                    <input type="radio" value="Receita" {...lancamentoForm.register('tipo')} className="hidden" />
                                    <ArrowUpRight className="w-5 h-5 mx-auto mb-1" />Receita
                                </label>
                                <label className={`cursor-pointer border-2 rounded-xl p-3.5 text-center transition-all ${watchTipo === 'Despesa' ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold' : 'border-slate-100 text-slate-500'}`}>
                                    <input type="radio" value="Despesa" {...lancamentoForm.register('tipo')} className="hidden" />
                                    <ArrowDownRight className="w-5 h-5 mx-auto mb-1" />Despesa
                                </label>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Vincular Cliente</label>
                                <select {...lancamentoForm.register('clienteId', { required: true })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition">
                                    <option value="">Selecione um cliente ativo...</option>
                                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoria de Atividade</label>
                                <select {...lancamentoForm.register('categoria', { required: true })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer">
                                    <option value="Comércio">🛍️ Comércio</option>
                                    <option value="Indústria">🏭 Indústria</option>
                                    <option value="Serviços">💼 Serviços</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição</label>
                                <input {...lancamentoForm.register('descricao', { required: true })} placeholder="Ex: Pagamento de Honorários" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor (R$)</label>
                                    <input type="number" step="0.01" {...lancamentoForm.register('valor', { required: true })} placeholder="0.00" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition font-medium" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Data</label>
                                    <input type="date" {...lancamentoForm.register('data', { required: true })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" {...lancamentoForm.register('hasNf')} className="peer sr-only" />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">Possui Nota Fiscal / Comprovante?</span>
                                </label>
                                {watchHasNf && (
                                    <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                                        {editingLancamento?.nfUrl && (
                                            <p className="text-xs text-slate-500 mb-2">Anexo atual: <a href={editingLancamento.nfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver arquivo</a> — envie um novo para substituir.</p>
                                        )}
                                        <input type="file" accept="image/*,application/pdf" {...lancamentoForm.register('nfFile', { required: watchHasNf && !editingLancamento?.nfUrl })} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition" />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={handleCloseLancamentoModal} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition cursor-pointer">Cancelar</button>
                                <button type="submit" disabled={uploadingImage} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer">
                                    {uploadingImage ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    {editingLancamento ? 'Salvar Alterações' : 'Confirmar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-60 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-44 animate-in zoom-in-95 duration-150"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => handleEditLancamento(contextMenu.item)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <Edit2 className="w-4 h-4 text-slate-400" /> Editar lançamento
                    </button>
                    <div className="h-px bg-slate-100 mx-2" />
                    <button
                        onClick={() => { setConfirmDelete(contextMenu.item); setContextMenu(null); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                        <Trash2 className="w-4 h-4" /> Excluir lançamento
                    </button>
                </div>
            )}

            {/* Confirm Delete */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600"><Trash2 className="w-5 h-5" /></div>
                            <h3 className="font-semibold text-slate-800">Excluir lançamento?</h3>
                        </div>
                        <p className="text-sm text-slate-500 ml-13">
                            "<span className="font-medium text-slate-700">{confirmDelete.descricao}</span>" será removido permanentemente.
                        </p>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer">Cancelar</button>
                            <button onClick={handleDeleteLancamento} className="px-5 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm shadow-rose-500/30 transition cursor-pointer">Excluir</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
