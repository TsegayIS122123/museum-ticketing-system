// Pin the timezone so date helpers are tested against the museum's locale
// (Addis Ababa, UTC+3) regardless of the machine running the suite.
process.env.TZ = 'Africa/Addis_Ababa';
