import { useState, useRef, useEffect } from 'react';
import { Truck, ArrowRight, Shield, User, Eye, EyeOff } from 'lucide-react';

export default function Login({ onLogin }) {
    const emailRef = useRef(null);
    const passwordRef = useRef(null);
    const [showPassword, setShowPassword] = useState(false);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('lastLoginTab') || 'client');
    const [error, setError] = useState('');
    const [isShaking, setIsShaking] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    const initializedRef = useRef(false);
    const activeTabRef = useRef(activeTab);

    // Keep ref in sync
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    // Auto-fill on mount
    useEffect(() => {
        setTimeout(() => {
            // Check for Auto-Login from URL params
            const params = new URLSearchParams(window.location.search);
            const isAutoLogin = params.get('autoLogin') === 'true';
            const urlUser = params.get('username');
            const urlPass = params.get('password');
            const urlTab = params.get('tab');

            if (isAutoLogin && urlUser && urlPass) {
                if (urlTab) {
                    setActiveTab(urlTab);
                    activeTabRef.current = urlTab; // update ref immediately
                }
                if (emailRef.current) emailRef.current.value = urlUser;
                if (passwordRef.current) passwordRef.current.value = urlPass;
                // Auto trigger login con reintentos
                if (!initializedRef.current) {
                    initializedRef.current = true;
                    // Función de reintento: espera a que la base de datos esté lista
                    const attemptAutoLogin = async (maxRetries = 8, delayMs = 800) => {
                        const currentEmail = emailRef.current?.value?.trim() || '';
                        const currentPassword = passwordRef.current?.value || '';
                        if (!currentEmail || !currentPassword) return;
                        
                        setIsLoading(true);
                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            try {
                                console.log(`[AutoLogin] Intento ${attempt}/${maxRetries}...`);
                                const success = await onLogin(activeTabRef.current, currentEmail, currentPassword);
                                if (success) {
                                    console.log(`[AutoLogin] ✅ Login exitoso en intento ${attempt}`);
                                    localStorage.setItem(`lastLoginUser_${activeTabRef.current}`, currentEmail);
                                    setIsLoading(false);
                                    return;
                                }
                            } catch (e) {
                                console.warn(`[AutoLogin] Error en intento ${attempt}:`, e);
                            }
                            // Si no es el último intento, esperar antes de reintentar
                            if (attempt < maxRetries) {
                                await new Promise(r => setTimeout(r, delayMs));
                            }
                        }
                        // Todos los intentos fallaron
                        console.error('[AutoLogin] ❌ Todos los intentos fallaron');
                        setError('No se pudo conectar. Inténtalo de nuevo.');
                        setIsLoading(false);
                        // Notificar a la web padre que el login definitivamente falló
                        if (window.parent !== window) {
                            window.parent.postMessage({ type: 'SUM_CLIENT_LOGIN_FAILED' }, '*');
                        }
                    };
                    // Esperar un poco antes del primer intento (dar tiempo al arranque inicial)
                    setTimeout(() => attemptAutoLogin(), 300);

                }
                return;
            }

            // Normal flow fallback
            if (activeTabRef.current && emailRef.current) {
                const savedUser = localStorage.getItem(`lastLoginUser_${activeTabRef.current}`);
                if (savedUser) emailRef.current.value = savedUser;
            }
        }, 100);
    }, []);

    const handleLogin = async () => {
        setError('');
        setIsShaking(false);
        setIsLoading(true);

        const currentEmail = emailRef.current?.value?.trim() || '';
        const currentPassword = passwordRef.current?.value || '';

        if (!currentEmail || !currentPassword) {
            setError('Por favor rellena usuario y contraseña');
            triggerShake();
            setIsLoading(false);
            return;
        }

        try {
            const success = await onLogin(activeTabRef.current, currentEmail, currentPassword);
            if (success) {
                localStorage.setItem(`lastLoginUser_${activeTab}`, currentEmail);
            } else {
                setError(activeTab === 'driver' ? 'Usuario o contraseña incorrectos' : 'Credenciales inválidas');
                triggerShake();
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Error al iniciar sesión. Inténtalo de nuevo.');
            triggerShake();
        } finally {
            setIsLoading(false);
        }
    };

    const triggerShake = () => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        localStorage.setItem('lastLoginTab', tab);
        setError('');
        
        if (emailRef.current) {
            const savedUser = localStorage.getItem(`lastLoginUser_${tab}`);
            if (savedUser) {
                emailRef.current.value = savedUser;
            } else {
                emailRef.current.value = '';
            }
        }
        
        if (passwordRef.current) {
            passwordRef.current.value = '';
        }
    };

    const getTabConfig = () => {
        switch (activeTab) {
            case 'driver':
                return {
                    title: 'Acceso Conductores',
                    subtitle: 'Gestiona tus rutas y entregas.',
                    icon: Truck,
                    color: 'bg-amber-500',
                    ring: 'focus:ring-amber-200',
                    btnClass: 'bg-amber-500 hover:bg-amber-600',
                    activeColor: 'text-amber-600',
                };
            case 'client':
                return {
                    title: 'Portal de Clientes',
                    subtitle: 'Realiza seguimiento de tus envíos.',
                    icon: User,
                    color: 'bg-emerald-500',
                    ring: 'focus:ring-emerald-200',
                    btnClass: 'bg-emerald-500 hover:bg-emerald-600',
                    activeColor: 'text-emerald-600',
                };
            default:
                return {
                    title: 'Administración',
                    subtitle: 'Panel de control de logística.',
                    icon: Shield,
                    color: 'bg-blue-600',
                    ring: 'focus:ring-blue-200',
                    btnClass: 'bg-blue-600 hover:bg-blue-700',
                    activeColor: 'text-blue-600',
                };
        }
    };

    const config = getTabConfig();
    const Icon = config.icon;

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex w-full max-w-4xl overflow-hidden min-h-[600px]">
                {/* Left Side - Form */}
                <div className="w-full md:w-1/2 p-12 flex flex-col justify-center">

                    {/* Brand Logo */}
                    <div className="flex justify-center mb-8">
                        <div className="p-4">
                            <img
                                src="/logo-sum.svg"
                                alt="Transportes SUM"
                                className="h-24 w-auto object-contain hover:scale-105 transition-transform duration-500"
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-lg mb-8">
                        {[
                            { id: 'admin', label: 'Admin', activeColor: 'text-blue-600' },
                            { id: 'driver', label: 'Repartidor', activeColor: 'text-amber-600' },
                            { id: 'client', label: 'Cliente', activeColor: 'text-emerald-600' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => handleTabChange(tab.id)}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                                    activeTab === tab.id
                                        ? `bg-white ${tab.activeColor} shadow-sm`
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="mb-6">
                        <div className={`w-12 h-12 ${config.color} rounded-xl flex items-center justify-center text-white mb-4`}>
                            <Icon size={24} />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">{config.title}</h1>
                        <p className="text-slate-500">{config.subtitle}</p>
                    </div>

                    <div className={`space-y-5 ${isShaking ? 'animate-shake' : ''}`}>
                        {error && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm text-center font-bold border border-red-100">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-slate-600 ml-1">
                                {activeTab === 'admin' ? 'Email Corporativo' : activeTab === 'driver' ? 'Usuario / ID' : 'Email de Contacto'}
                            </label>
                            <input
                                ref={emailRef}
                                type="text"
                                autoComplete="username"
                                className={`w-full px-5 py-3.5 rounded-xl border border-slate-200 focus:border-transparent focus:ring-2 ${config.ring} outline-none transition-all shadow-sm bg-slate-50 focus:bg-white`}
                                placeholder={activeTab === 'admin' ? 'Tu email' : activeTab === 'driver' ? 'Tu usuario' : 'Tu email'}
                                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-slate-600 ml-1">Contraseña</label>
                            <div className="relative">
                                <input
                                    ref={passwordRef}
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    className={`w-full px-5 py-3.5 rounded-xl border border-slate-200 focus:border-transparent focus:ring-2 ${config.ring} outline-none transition-all shadow-sm bg-slate-50 focus:bg-white`}
                                    placeholder="••••••••"
                                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleLogin}
                            disabled={isLoading}
                            className={`w-full ${config.btnClass} text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 hover:shadow-xl ${isLoading ? 'opacity-75 cursor-wait' : ''}`}
                        >
                            {isLoading ? 'Comprobando...' : 'Iniciar Sesión'}
                            {!isLoading && <ArrowRight size={20} />}
                        </button>
                    </div>

                    <p className="mt-8 text-center text-sm text-slate-400">
                        © {new Date().getFullYear()} Sumtrans Logística — Todos los derechos reservados
                    </p>
                </div>

                {/* Right Side - Image/Decoration */}
                <div className="hidden md:block w-1/2 bg-slate-900 relative">
                    <div className={`absolute inset-0 bg-gradient-to-br transition-colors duration-500 z-10 ${
                        activeTab === 'admin' ? 'from-blue-600/20 to-purple-600/20' :
                        activeTab === 'driver' ? 'from-amber-600/20 to-orange-600/20' :
                        'from-emerald-600/20 to-teal-600/20'
                    }`}></div>
                    <img
                        src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80"
                        alt="Logistics Warehouse"
                        className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700"
                    />
                    <div className="absolute bottom-12 left-12 right-12 z-20 text-white">
                        <h2 className="text-2xl font-bold mb-4">Gestión Inteligente de Flotas</h2>
                        <p className="text-slate-300">Monitorea envíos en tiempo real, optimiza rutas y maximiza la eficiencia de tu operación logística.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
