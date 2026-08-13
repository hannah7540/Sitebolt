-- Electrical conduit specification lookup (HV/LV/Comms Other/Comms Mains)

INSERT INTO itc_service_spec_rules (
  service_type, material_and_size,
  min_horizontal_sep_mm, min_vertical_sep_mm, min_bedding_mm, min_side_mm,
  min_overlay_mm, min_cover_mm, bedding_and_overlay_material, cover_material, sort_order
) VALUES
  ('HV', '150mm HD Orange Conduit', 350, 175, 100, 175, 100, 650, 'Bed Sand', 'Roadbase', 10),
  ('HV', '200mm HD Orange Conduit', 400, 200, 125, 200, 125, 700, 'Bed Sand', 'Roadbase', 11),
  ('LV', '50mm HD Orange Conduit', 200, 100, 50, 100, 50, 450, 'Bed Sand', 'Roadbase', 20),
  ('LV', '65mm HD Orange Conduit', 220, 110, 55, 110, 55, 475, 'Bed Sand', 'Roadbase', 21),
  ('LV', '80mm HD Orange Conduit', 240, 120, 60, 120, 60, 500, 'Bed Sand', 'Roadbase', 22),
  ('LV', '100mm HD Orange Conduit', 260, 130, 65, 130, 65, 525, 'Bed Sand', 'Roadbase', 23),
  ('LV', '150mm HD Orange Conduit', 300, 150, 75, 150, 75, 575, 'Bed Sand', 'Roadbase', 24),
  ('Comms Other', '32mm White Conduit', 150, 75, 50, 75, 50, 450, 'Bed Sand', 'Roadbase', 30),
  ('Comms Other', '50mm White Conduit', 150, 75, 50, 75, 50, 450, 'Bed Sand', 'Roadbase', 31),
  ('Comms Other', '80mm White Conduit', 175, 85, 55, 85, 55, 475, 'Bed Sand', 'Roadbase', 32),
  ('Comms Other', '100mm White Conduit', 200, 100, 60, 100, 60, 500, 'Bed Sand', 'Roadbase', 33),
  ('Comms Mains', '100mm Comms Mains Conduit', 250, 125, 75, 125, 75, 550, 'Bed Sand', 'Roadbase', 40)
ON CONFLICT (service_type, material_and_size) DO UPDATE SET
  min_horizontal_sep_mm = EXCLUDED.min_horizontal_sep_mm,
  min_vertical_sep_mm = EXCLUDED.min_vertical_sep_mm,
  min_bedding_mm = EXCLUDED.min_bedding_mm,
  min_side_mm = EXCLUDED.min_side_mm,
  min_overlay_mm = EXCLUDED.min_overlay_mm,
  min_cover_mm = EXCLUDED.min_cover_mm,
  bedding_and_overlay_material = EXCLUDED.bedding_and_overlay_material,
  cover_material = EXCLUDED.cover_material,
  sort_order = EXCLUDED.sort_order;
