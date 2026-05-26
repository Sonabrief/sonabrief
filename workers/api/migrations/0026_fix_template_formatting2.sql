-- Fix "**. " pattern (bold end + period + space before rules) → "**\n\n"
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_generic_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_one_on_one_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_standup_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_client_meeting_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_discovery_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_sales_call_en_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_decision_en_v1';

UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_generic_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_one_on_one_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_standup_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_client_meeting_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_discovery_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_sales_call_fr_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_decision_fr_v1';

UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_generic_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_one_on_one_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_standup_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_client_meeting_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_discovery_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_sales_call_es_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_decision_es_v1';

UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_generic_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_one_on_one_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_standup_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_client_meeting_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_discovery_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_sales_call_de_v1';
UPDATE templates SET system_prompt = REPLACE(system_prompt, '**. ', '**

') WHERE id = 'sys_decision_de_v1';
