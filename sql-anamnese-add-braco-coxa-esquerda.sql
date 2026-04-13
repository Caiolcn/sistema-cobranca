-- Adiciona braço esquerdo e coxa esquerda na anamnese
ALTER TABLE anamneses
  ADD COLUMN IF NOT EXISTS braco_esquerdo DECIMAL(5,2);

ALTER TABLE anamneses
  ADD COLUMN IF NOT EXISTS coxa_esquerda DECIMAL(5,2);
