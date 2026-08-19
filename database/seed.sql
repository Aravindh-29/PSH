-- Seed data for Pure Storage Horizon

-- Modules
INSERT INTO modules (name, description) VALUES
  ('Hardware', 'Physical hardware issues'),
  ('Software', 'Software and application issues'),
  ('Network', 'Network connectivity issues'),
  ('Application', 'Business application issues'),
  ('Access', 'Access and permissions'),
  ('Security', 'Security incidents'),
  ('Database', 'Database issues'),
  ('Cloud', 'Cloud infrastructure'),
  ('Email', 'Email and communication'),
  ('Other', 'Other issues')
ON CONFLICT (name) DO NOTHING;

-- Categories
INSERT INTO categories (name, description) VALUES
  ('Incident', 'Unplanned interruption or reduction in quality'),
  ('Service Request', 'Request for something new'),
  ('Access Request', 'Request for access or permissions'),
  ('Problem', 'Root cause of one or more incidents'),
  ('Change', 'Request to change something'),
  ('Other', 'Other category')
ON CONFLICT (name) DO NOTHING;

