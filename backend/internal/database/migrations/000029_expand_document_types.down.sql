-- Revert to original document_type check constraint (removes pa_contract, letter_of_representation, carrier_acknowledgement)
ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;

ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
CHECK (document_type IN (
    'policy_pdf',
    'contractor_photo',
    'contractor_estimate',
    'carrier_estimate',
    'proof_of_repair',
    'other'
));
