import fs from 'fs';
const path = 'src/pages/driver/DriverDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `                        const getScore = (item) => {
                            let score = 0;
                            const isUrgent = item._priority === 'urgent';
                            const hasCoords = item._coords && String(item._coords).includes(',');
                            const addr = normalize(item.destinationAddress || item.address || '');

                            // 1. Coordination Hierarchy (Mandatory groupers)
                            if (!hasCoords) {
                                score += 1000; // Penalty for no GPS (Address fallback)
                                if (addr === '') score += 5000; // Extra penalty for truly empty address
                            }

                            // 2. Proximity (Primary Driver)
                            if (myLat && myLon && hasCoords) {
                                const [lat, lon] = String(item._coords).split(',').map(Number);
                                const dist = getDistance(myLat, myLon, lat, lon);
                                score += dist * 10; // 1km = 10 points
                            }

                            // 3. Urgency (Priority Boost)
                            if (isUrgent) {
                                // An urgent item gets a "discount" on its score.
                                // It effectively acts as if it were 15km closer.
                                score -= 150; 
                            }

                            return score;
                        };`;

const newCode = `                        // Morning/Afternoon town priority setup
                        const currentHour = new Date().getHours();
                        const isMorningShift = currentHour < 14;
                        const driverMorningTowns = (currentDriver?.morningTowns || []).map(t => t.trim().toLowerCase());
                        const driverAfternoonTowns = (currentDriver?.afternoonTowns || []).map(t => t.trim().toLowerCase());

                        const getScore = (item) => {
                            let score = 0;
                            const isUrgent = item._priority === 'urgent';
                            const hasCoords = item._coords && String(item._coords).includes(',');
                            const addr = normalize(item.destinationAddress || item.address || '');
                            const city = normalize(item.destinationCity || '');

                            // 1. Coordination Hierarchy (Mandatory groupers)
                            if (!hasCoords) {
                                score += 1000; // Penalty for no GPS (Address fallback)
                                if (addr === '') score += 5000; // Extra penalty for truly empty address
                            }

                            // 2. Morning/Afternoon Town Priority
                            if (city && (driverMorningTowns.length > 0 || driverAfternoonTowns.length > 0)) {
                                const isInMorning = driverMorningTowns.some(t => city.includes(t) || t.includes(city));
                                const isInAfternoon = driverAfternoonTowns.some(t => city.includes(t) || t.includes(city));
                                if (isMorningShift) {
                                    if (isInMorning) score -= 300;  // Boost morning towns in AM
                                    if (isInAfternoon) score += 200; // Push afternoon towns down in AM
                                } else {
                                    if (isInAfternoon) score -= 300;  // Boost afternoon towns in PM
                                    if (isInMorning) score += 200;   // Push morning towns down in PM
                                }
                            }

                            // 3. Proximity (Primary Driver)
                            if (myLat && myLon && hasCoords) {
                                const [lat, lon] = String(item._coords).split(',').map(Number);
                                const dist = getDistance(myLat, myLon, lat, lon);
                                score += dist * 10; // 1km = 10 points
                            }

                            // 4. Urgency (Priority Boost)
                            if (isUrgent) {
                                // An urgent item gets a "discount" on its score.
                                // It effectively acts as if it were 15km closer.
                                score -= 150; 
                            }

                            return score;
                        };`;

// Normalize line endings for comparison
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = oldCode.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOld)) {
    const result = normalizedContent.replace(normalizedOld, newCode.replace(/\r\n/g, '\n'));
    // Restore CRLF
    fs.writeFileSync(path, result.replace(/\n/g, '\r\n'), 'utf8');
    console.log('✅ Replacement successful!');
} else {
    console.log('❌ Target content not found');
    const lines = normalizedContent.split('\n');
    console.log('Lines 1200-1210:');
    lines.slice(1199, 1210).forEach((l, i) => console.log(`${1200+i}: ${JSON.stringify(l)}`));
}
