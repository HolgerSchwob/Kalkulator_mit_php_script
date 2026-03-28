-- Korrektur Testkunde: Tippfehler in der Domain (digitaldrucl → digitaldruck), falls 018 schon mit alter E-Mail lief.

UPDATE public.b2b_accounts
SET contact_email = 'schwob@schwob-digitaldruck.de'
WHERE contact_email = 'schwob@schwob-digitaldrucl.de';
