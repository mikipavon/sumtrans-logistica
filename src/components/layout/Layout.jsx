import Sidebar from './Sidebar';

export default function Layout({ children, onLogout, currentView, onNavigate, pendingClientsCount }) {
    return (
        <div className="min-h-screen bg-slate-50">
            <Sidebar onLogout={onLogout} currentView={currentView} onNavigate={onNavigate} pendingClientsCount={pendingClientsCount} />
            <div className="pl-64 transition-all duration-300">
                <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-800">Panel de Control</h2>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
                            JD
                        </div>
                    </div>
                </header>
                <main className="p-8 max-w-7xl mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
