import fs from 'fs';

const path = 'src/pages/driver/DriverDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// The block to replace
const targetDivStart = `                                        <div key={shipment.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 relative overflow-hidden">
                                            {/* Status indicator strip */}`;

const newDivStart = `                                        <div 
                                            key={shipment.id} 
                                            onClick={() => setSelectedShipment(shipment)}
                                            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 relative overflow-hidden cursor-pointer hover:border-blue-300 transition-colors"
                                        >
                                            {/* Status indicator strip */}`;

// Update the DIV start
if (content.includes(targetDivStart)) {
    content = content.replace(targetDivStart, newDivStart);
    console.log("✅ Main div patched");
} else {
    // try removing crlf
    const nC = content.replace(/\r\n/g, '\n');
    const nT = targetDivStart.replace(/\r\n/g, '\n');
    if (nC.includes(nT)) {
        content = nC.replace(nT, newDivStart.replace(/\r\n/g, '\n'));
        console.log("✅ Main div patched (with crlf normalize)");
    } else {
        console.log("❌ Target div start not found!");
    }
}

// Update the select click propagation
const targetSelect = `<select
                                                        className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:border-blue-500 max-w-[150px]"
                                                        onChange={(e) => {
                                                            if (e.target.value) onAssignShipment(shipment.id, e.target.value)
                                                        }}
                                                        value=""
                                                    >`;

const newSelect = `<select
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:border-blue-500 max-w-[150px]"
                                                        onChange={(e) => {
                                                            if (e.target.value) onAssignShipment(shipment.id, e.target.value)
                                                        }}
                                                        value=""
                                                    >`;

if (content.includes(targetSelect)) {
    content = content.replace(targetSelect, newSelect);
    console.log("✅ Select patched");
} else {
    // try normalization
    const nC = content.replace(/\r\n/g, '\n');
    const nT = targetSelect.replace(/\r\n/g, '\n');
    if (nC.includes(nT)) {
        content = nC.replace(nT, newSelect.replace(/\r\n/g, '\n'));
        console.log("✅ Select patched (normalize)");
    } else {
        console.log("❌ Target select not found!");
    }
}

// Ensure the print dropdown also prevents propagation
const docActionButton = `<button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenAssignDocMenuId(openAssignDocMenuId === shipment.id ? null : shipment.id);
                                                        }}
                                                        className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                                                    >`;
// this looks correct already because it has e.stopPropagation. 
// let's do writeFileSync.

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
