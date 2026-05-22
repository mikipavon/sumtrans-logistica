import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                                                {listeningField === 'sender' ? 'ESCUCHANDO...' : 'HABLAR'}
                                            </button>
                                        </div>
                                        <div className="relative">`;

const replace = `                                                {listeningField === 'sender' ? 'ESCUCHANDO...' : 'HABLAR'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="relative">`;

const normC = content.replace(/\r\n/g, '\n');
const normT = target.replace(/\r\n/g, '\n');

if (normC.includes(normT)) {
    fs.writeFileSync(path, normC.replace(normT, replace.replace(/\r\n/g, '\n')), 'utf8');
    console.log("✅ CreateShipmentModal syntax error fixed");
} else {
    console.log("❌ Target not found");
}

