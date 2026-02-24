import { useState, useEffect } from 'react';
import { DollarSign, Plus, ArrowUpRight, ArrowDownRight, Paperclip, CheckCircle2 } from 'lucide-react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../services/firebaseConfig';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

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
    createdAt: Timestamp;
    userId: string;
}

interface FormValues {
    descricao: string;
    valor: number;
    tipo: 'Receita' | 'Despesa';
    data: string;
    hasNf: boolean;
    clienteId: string;
    nfFile?: FileList;
}

export function Financeiro() {
    const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
    const [clientes, setClientes] = useState<{ id: string, nomeFantasia: string }[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const { currentUser } = useAuth();

    const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
        defaultValues: { tipo: 'Receita', hasNf: false, data: new Date().toISOString().split('T')[0], clienteId: '' }
    });

    const watchHasNf = watch('hasNf');

    const fetchClientes = async () => {
        if (!currentUser) return;
        try {
            const q = query(
                collection(db, 'clientes'),
                where('userId', '==', currentUser.uid),
                where('status', '==', 'Ativo')
            );
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, nomeFantasia: doc.data().nomeFantasia }));
            data.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia));
            setClientes(data);
        } catch (error) {
            console.error("Erro ao buscar clientes ativos:", error);
        }
    };

    const fetchLancamentos = async () => {
        if (!currentUser) return;
        try {
            const q = query(collection(db, 'financeiro'), where('userId', '==', currentUser.uid));
            const querySnapshot = await getDocs(q);
            let data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Lancamento[];
            data = data.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
            setLancamentos(data);
        } catch (error) {
            console.error("Erro ao buscar lançamentos:", error);
        }
    };

    useEffect(() => {
        fetchLancamentos();
        fetchClientes();
    }, [currentUser]);

    const onSubmit = async (data: FormValues) => {
        if (!currentUser) return;
        setUploadingImage(true);
        let url = '';

        try {
            if (data.hasNf && data.nfFile && data.nfFile.length > 0) {
                const file = data.nfFile[0];
                const fileName = `${Date.now()}_${file.name}`;
                // Salvando dentro da pasta com o ID do usuário conforme as security rules do Storage
                const storageRef = ref(storage, `notas_fiscais/${currentUser.uid}/${fileName}`);
                const snapshot = await uploadBytes(storageRef, file);
                url = await getDownloadURL(snapshot.ref);
            }

            const clienteSelecionado = clientes.find(c => c.id === data.clienteId);

            await addDoc(collection(db, 'financeiro'), {
                descricao: data.descricao,
                valor: Number(data.valor),
                tipo: data.tipo,
                data: data.data,
                hasNf: data.hasNf,
                nfUrl: url || null,
                clienteId: data.clienteId,
                clienteNome: clienteSelecionado ? clienteSelecionado.nomeFantasia : 'Sem Vínculo',
                userId: currentUser.uid,
                createdAt: Timestamp.now()
            });

            setIsModalOpen(false);
            reset();
            fetchLancamentos();
        } catch (error) {
            console.error("Erro ao salvar lançamento:", error);
            alert("Erro ao salvar lançamento financeiro.");
        } finally {
            setUploadingImage(false);
        }
    };

    const saldo = lancamentos.reduce((acc, curr) => curr.tipo === 'Receita' ? acc + curr.valor : acc - curr.valor, 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">Saldo Atual</p>
                        <h3 className={`text-3xl font-bold tracking-tight ${saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            R$ {saldo.toFixed(2)}
                        </h3>
                    </div>
                    <div className={`p-4 rounded-2xl ${saldo >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <DollarSign className="w-8 h-8" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-slate-500 mb-1">Receitas</p>
                        <h3 className="text-xl font-bold tracking-tight text-slate-800">
                            R$ {lancamentos.filter(l => l.tipo === 'Receita').reduce((a, b) => a + b.valor, 0).toFixed(2)}
                        </h3>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                        <ArrowUpRight className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-slate-500 mb-1">Despesas</p>
                        <h3 className="text-xl font-bold tracking-tight text-slate-800">
                            R$ {lancamentos.filter(l => l.tipo === 'Despesa').reduce((a, b) => a + b.valor, 0).toFixed(2)}
                        </h3>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
                        <ArrowDownRight className="w-6 h-6" />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center py-4">
                <h2 className="text-xl font-bold text-slate-800">Histórico de Movimentações</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/30 transition flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Novo Lançamento
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4">Data</th>
                            <th className="px-6 py-4">Descrição</th>
                            <th className="px-6 py-4">Cliente / Origem</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4 font-right">Valor</th>
                            <th className="px-6 py-4 text-center">Nota Fiscal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {lancamentos.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    Nenhuma movimentação registrada.
                                </td>
                            </tr>
                        ) : null}
                        {lancamentos.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">{format(new Date(item.data), 'dd/MM/yyyy')}</td>
                                <td className="px-6 py-4 font-medium text-slate-800">{item.descricao}</td>
                                <td className="px-6 py-4 text-slate-600 font-medium text-xs">{item.clienteNome || 'Sem Vínculo'}</td>
                                <td className="px-6 py-4">
                                    <span className={`flex items-center gap-1.5 text-sm font-medium ${item.tipo === 'Receita' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {item.tipo === 'Receita' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                        {item.tipo}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-semibold text-slate-800">R$ {item.valor.toFixed(2)}</td>
                                <td className="px-6 py-4 text-center">
                                    {item.hasNf && item.nfUrl ? (
                                        <a href={item.nfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition text-xs font-medium">
                                            <Paperclip className="w-4 h-4" /> Ver Anexo
                                        </a>
                                    ) : (
                                        <span className="text-slate-400 text-xs">Sem anexo</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">Registrar Movimentação</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 bg-white rounded-full shadow-sm">
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5 flex flex-col">
                            <div className="grid grid-cols-2 gap-4">
                                <label className={`cursor-pointer border-2 rounded-xl p-4 text-center transition-all ${watch('tipo') === 'Receita' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}>
                                    <input type="radio" value="Receita" {...register('tipo')} className="hidden" />
                                    <ArrowUpRight className="w-6 h-6 mx-auto mb-2" />
                                    Receita
                                </label>
                                <label className={`cursor-pointer border-2 rounded-xl p-4 text-center transition-all ${watch('tipo') === 'Despesa' ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}>
                                    <input type="radio" value="Despesa" {...register('tipo')} className="hidden" />
                                    <ArrowDownRight className="w-6 h-6 mx-auto mb-2" />
                                    Despesa
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Vincular Cliente</label>
                                <select
                                    {...register('clienteId', { required: true })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                                >
                                    <option value="">Selecione um cliente ativo...</option>
                                    {clientes.map(cliente => (
                                        <option key={cliente.id} value={cliente.id}>{cliente.nomeFantasia}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição do Lançamento</label>
                                <input
                                    {...register('descricao', { required: true })}
                                    placeholder="Ex: Pagamento de Honorários"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        {...register('valor', { required: true })}
                                        placeholder="0.00"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Data</label>
                                    <input
                                        type="date"
                                        {...register('data', { required: true })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" {...register('hasNf')} className="peer sr-only" />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">Possui Nota Fiscal / Comprovante?</span>
                                </label>

                                {watchHasNf && (
                                    <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            {...register('nfFile', { required: true })}
                                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 mt-2 mb-2 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploadingImage}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {uploadingImage ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckCircle2 className="w-5 h-5" />}
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
