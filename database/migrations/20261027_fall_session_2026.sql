-- Fall 2026 session: October 26 to December 17 (Alliance Academy poster).
-- The previous schedule ends the day before; teachers and studios can be added
-- to each class in Admin -> Classes.

-- Classes already running stop when the new session starts.
UPDATE public.classes
   SET ends_on = DATE '2026-10-25', updated_at = now()
 WHERE (ends_on IS NULL OR ends_on > DATE '2026-10-25')
   AND (starts_on IS NULL OR starts_on < DATE '2026-10-26');

INSERT INTO public.classes
  (title, style, level, day_of_week, start_time, duration_minutes, starts_on, ends_on)
SELECT session.title, session.style, session.level, session.day_of_week,
       session.start_time::time, 60, DATE '2026-10-26', DATE '2026-12-17'
  FROM (VALUES
    -- Monday
    ('Bachata Beginner', 'Bachata', 'beginner', 1, '18:00'),
    ('Salsa On1 Beginner', 'Salsa', 'beginner', 1, '19:00'),
    -- Tuesday
    ('Tango Beginner', 'Tango', 'beginner', 2, '18:00'),
    ('Salsa On2 Beginner', 'Salsa', 'beginner', 2, '19:00'),
    ('Salsa On2 Intermediate', 'Salsa', 'intermediate', 2, '20:00'),
    -- Wednesday
    ('Bachata Fusion Open', 'Bachata', 'open', 3, '18:00'),
    ('Body Movement Open', 'Body Movement', 'open', 3, '19:00'),
    ('Salsa Fusion Open', 'Salsa', 'open', 3, '20:00'),
    -- Thursday
    ('Salsa On1 Intermediate', 'Salsa', 'intermediate', 4, '18:00'),
    ('Bachata Intermediate', 'Bachata', 'intermediate', 4, '19:00'),
    ('Salsa On2 Footwork & Partnerwork', 'Salsa', 'open', 4, '20:00')
  ) AS session (title, style, level, day_of_week, start_time)
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.classes AS existing
    WHERE existing.title = session.title
      AND existing.day_of_week = session.day_of_week
      AND existing.start_time = session.start_time::time
      AND existing.starts_on = DATE '2026-10-26'
 );
