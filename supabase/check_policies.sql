-- Fix missing driver policies for existing tables

-- Driver needs to INSERT/UPDATE clients (creating client from shipment form)
CREATE POLICY "driver_insert_clients" ON public.clients
  FOR INSERT WITH CHECK (get_user_role() = 'driver');

CREATE POLICY "driver_update_clients" ON public.clients
  FOR UPDATE USING (get_user_role() = 'driver');

-- Driver needs INSERT on fuel_logs
CREATE POLICY "driver_insert_fuel" ON public.fuel_logs
  FOR INSERT WITH CHECK (get_user_role() = 'driver');

-- Driver needs DELETE on shipments (converting pickup to delivery)
CREATE POLICY "driver_delete_shipments" ON public.shipments
  FOR DELETE USING (get_user_role() = 'driver');

-- Driver needs UPDATE on ALL shipments (not just assigned ones - for status changes during creation)
DROP POLICY IF EXISTS "driver_update_assigned_shipments" ON public.shipments;
CREATE POLICY "driver_update_shipments" ON public.shipments
  FOR UPDATE USING (get_user_role() = 'driver');
