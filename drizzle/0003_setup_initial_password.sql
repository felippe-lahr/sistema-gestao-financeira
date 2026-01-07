-- Migration: Setup initial password for felippe.lahr@gmail.com
-- Password: Zero2026_! (hashed with bcrypt)

-- First, update the user name
UPDATE users 
SET name = 'Felippe Lahr' 
WHERE email = 'felippe.lahr@gmail.com';

-- Then, insert the password (or update if exists)
INSERT INTO user_passwords (user_id, password_hash, created_at, updated_at)
SELECT id, '$2b$10$oJuEJCiLU/fBuPuMQD9DDOHT96IZ7I9BlE.DOPXad7dAypizLpht.', NOW(), NOW()
FROM users 
WHERE email = 'felippe.lahr@gmail.com'
ON CONFLICT (user_id) 
DO UPDATE SET password_hash = '$2b$10$oJuEJCiLU/fBuPuMQD9DDOHT96IZ7I9BlE.DOPXad7dAypizLpht.', updated_at = NOW();
