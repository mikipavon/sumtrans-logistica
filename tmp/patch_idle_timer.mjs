import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const targetState = `    const [selectedDebtIds, setSelectedDebtIds] = useState([]); // Deudas seleccionadas para cobrar
    const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);`;

const replacementState = `    const [selectedDebtIds, setSelectedDebtIds] = useState([]); // Deudas seleccionadas para cobrar
    const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);

    // --- IDLE TIMER (Auto-close after 2 mins of inactivity if open) ---
    const idleTimerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            return;
        }
        
        // Clear previous timer
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        // Set a new timer for 2 minutes (120000 ms)
        idleTimerRef.current = setTimeout(() => {
            // Auto-close due to inactivity
            onClose();
        }, 120000);

        // Cleanup on unmount or when dependencies change
        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [isOpen, formData, selectedArticles, keepOrigin]);
    // ----------------------------------------------------------------`;

const normC = content.replace(/\r\n/g, '\n');
const normT = targetState.replace(/\r\n/g, '\n');

if (normC.includes(normT)) {
    content = normC.replace(normT, replacementState.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, content, 'utf8');
    console.log("✅ Auto-close timer injected!");
} else {
    console.log("❌ Target not found");
}
