import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function createDummyShipment() {
  const dummyId = `SUM-SIMULACION-${Math.floor(Math.random() * 1000)}`;
  const dummyData = {
    id: dummyId,
    client: 'PRUEBA SECRETA S.L.',
    type: 'Entrega',
    status: 'Entregado',
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    originName: 'PRUEBA SECRETA S.L.',
    originAddress: 'Calle Falsa 123',
    originCity: 'Madrid',
    originZip: '28080',
    destinationName: 'Cliente Final',
    destinationAddress: 'Avenida Falsa 456',
    destinationCity: 'Barcelona',
    destinationZip: '08080',
    amount: 150.50,
    hasCod: false,
    assignedDriverId: null, // As you wish
    deliverySignature: 'https://mottccbalzdzrgqzfkdl.supabase.co/storage/v1/object/public/signatures/dummy-signature-123.png',
    deliveryPhoto: 'https://mottccbalzdzrgqzfkdl.supabase.co/storage/v1/object/public/photos/dummy-photo-456.jpg',
    receiverName: 'Juan Pérez',
    receiverId: '12345678A',
    deliveryCoordinates: '40.4168,-3.7038',
    observations: 'Simulación para pruebas de exportación Excel de Privacidad',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase.from('shipments').insert([
    {
      id: dummyId,
      status: 'Entregado',
      assignedDriverId: null,
      data: dummyData
    }
  ]);

  if (error) {
    console.error('Error insertando simulacion:', error);
  } else {
    console.log('✅ Simulación insertada correctamente con ID:', dummyId);
  }
}

createDummyShipment();
