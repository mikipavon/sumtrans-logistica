
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mottccbalzdzrggzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY';
const supabase = createClient(supabaseUrl, supabaseKey);

const towns = [
    { name: "Aguilar de la Frontera", match: "Aguilar de la Frontera", zipPrefix: "14900", province: "Córdoba", country: "España", price: 0 },
    { name: "Almedinilla", match: "Almedinilla", zipPrefix: "14812", province: "Córdoba", country: "España", price: 0 },
    { name: "Baena", match: "Baena", zipPrefix: "14850", province: "Córdoba", country: "España", price: 0 },
    { name: "Benamejí", match: "Benamejí", zipPrefix: "14910", province: "Córdoba", country: "España", price: 0 },
    { name: "Cabra", match: "Cabra", zipPrefix: "14940", province: "Córdoba", country: "España", price: 0 },
    { name: "Carcabuey", match: "Carcabuey", zipPrefix: "14810", province: "Córdoba", country: "España", price: 0 },
    { name: "Castro del Río", match: "Castro del Río", zipPrefix: "14840", province: "Córdoba", country: "España", price: 0 },
    { name: "Córdoba", match: "Córdoba", zipPrefix: "14", province: "Córdoba", country: "España", price: 0 },
    { name: "Nueva Carteya", match: "Nueva Carteya", zipPrefix: "14860", province: "Córdoba", country: "España", price: 0 },
    { name: "Doña Mencía", match: "Doña Mencía", zipPrefix: "14857", province: "Córdoba", country: "España", price: 0 },
    { name: "El Tejar", match: "El Tejar", zipPrefix: "14915", province: "Córdoba", country: "España", price: 0 },
    { name: "Encinas Reales", match: "Encinas Reales", zipPrefix: "14913", province: "Córdoba", country: "España", price: 0 },
    { name: "Espejo", match: "Espejo", zipPrefix: "14830", province: "Córdoba", country: "España", price: 0 },
    { name: "Fernán-Núñez", match: "Fernán-Núñez", zipPrefix: "14520", province: "Córdoba", country: "España", price: 0 },
    { name: "Iznájar", match: "Iznájar", zipPrefix: "14970", province: "Córdoba", country: "España", price: 0 },
    { name: "La Rambla", match: "La Rambla", zipPrefix: "14540", province: "Córdoba", country: "España", price: 0 },
    { name: "Lucena", match: "Lucena", zipPrefix: "14900", province: "Córdoba", country: "España", price: 0 },
    { name: "Luque", match: "Luque", zipPrefix: "14880", province: "Córdoba", country: "España", price: 0 },
    { name: "Los Llanos de Don Juan", match: "Los Llanos de Don Juan", zipPrefix: "14911", province: "Córdoba", country: "España", price: 0 },
    { name: "Priego de Córdoba", match: "Priego de Córdoba", zipPrefix: "14800", province: "Córdoba", country: "España", price: 0 },
    { name: "Palenciana", match: "Palenciana", zipPrefix: "14914", province: "Córdoba", country: "España", price: 0 },
    { name: "Puente Genil", match: "Puente Genil", zipPrefix: "14500", province: "Córdoba", country: "España", price: 0 },
    { name: "Montalbán de Córdoba", match: "Montalbán de Córdoba", zipPrefix: "14548", province: "Córdoba", country: "España", price: 0 },
    { name: "Montemayor", match: "Montemayor", zipPrefix: "14550", province: "Córdoba", country: "España", price: 0 },
    { name: "Montilla", match: "Montilla", zipPrefix: "14550", province: "Córdoba", country: "España", price: 0 },
    { name: "Monturque", match: "Monturque", zipPrefix: "14930", province: "Córdoba", country: "España", price: 0 },
    { name: "Rute", match: "Rute", zipPrefix: "14960", province: "Córdoba", country: "España", price: 0 },
    { name: "Antequera", match: "Antequera", zipPrefix: "29200", province: "Málaga", country: "España", price: 0 },
    { name: "Alameda", match: "Alameda", zipPrefix: "29530", province: "Málaga", country: "España", price: 0 },
    { name: "Casariche", match: "Casariche", zipPrefix: "41580", province: "Sevilla", country: "España", price: 0 },
    { name: "Cuevas de San Marcos", match: "Cuevas de San Marcos", zipPrefix: "29210", province: "Málaga", country: "España", price: 0 },
    { name: "Estepa", match: "Estepa", zipPrefix: "41560", province: "Sevilla", country: "España", price: 0 },
    { name: "Fuente de Piedra", match: "Fuente de Piedra", zipPrefix: "29520", province: "Málaga", country: "España", price: 0 },
    { name: "Humilladero", match: "Humilladero", zipPrefix: "29531", province: "Málaga", country: "España", price: 0 },
    { name: "Herrera", match: "Herrera", zipPrefix: "41567", province: "Sevilla", country: "España", price: 0 },
    { name: "Jauja", match: "Jauja", zipPrefix: "14911", province: "Córdoba", country: "España", price: 0 },
    { name: "La Roda de Andalucía", match: "La Roda de Andalucía", zipPrefix: "41590", province: "Sevilla", country: "España", price: 0 },
    { name: "Mollina", match: "Mollina", zipPrefix: "29532", province: "Málaga", country: "España", price: 0 },
    { name: "Moriles", match: "Moriles", zipPrefix: "14510", province: "Córdoba", country: "España", price: 0 },
    { name: "Navas del Selpillar", match: "Navas del Selpillar", zipPrefix: "14911", province: "Córdoba", country: "España", price: 0 },
    { name: "Santa Cruz", match: "Santa Cruz", zipPrefix: "14820", province: "Córdoba", country: "España", price: 0 }
];

async function run() {
    console.log(`Iniciando importación de ${towns.length} pueblos...`);
    const { data, error } = await supabase
        .from('tariffs')
        .insert(towns.map(t => ({
            name: `Zona ${t.name}`,
            match: t.match,
            zipPrefix: t.zipPrefix,
            province: t.province,
            country: t.country,
            price: t.price
        })));
    
    if (error) {
        console.error('Error durante la importación:', error);
    } else {
        console.log('¡Importación completada con éxito!');
    }
}

run();
