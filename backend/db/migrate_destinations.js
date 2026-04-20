const pool = require("./pool");

const seedCities = [
  "Kathmandu",
  "Pokhara",
  "Lukla",
  "Bharatpur",
  "Bhadrapur",
  "Nepalgunj",
  "Bhairahawa",
  "Simara",
];

const destinationMedia = {
  Kathmandu: {
    image_url:
      "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop",
    tagline: "Capital valley and heritage squares",
  },
  Pokhara: {
    image_url:
      "https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop",
    tagline: "Phewa Lake and Annapurna views",
  },
  Lukla: {
    image_url:
      "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop",
    tagline: "Everest gateway and alpine trails",
  },
  Bharatpur: {
    image_url:
      "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop",
    tagline: "Chitwan safari and river plains",
  },
  Bhadrapur: {
    image_url:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop",
    tagline: "Tea gardens and eastern hills",
  },
  Nepalgunj: {
    image_url:
      "https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop",
    tagline: "Western gateway and cultural bazaars",
  },
  Bhairahawa: {
    image_url:
      "https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop",
    tagline: "Lumbini plains and Terai warmth",
  },
  Simara: {
    image_url:
      "https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop",
    tagline: "Terai corridor and forest edge",
  },
};

async function migrateDestinations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS destinations (
        id SERIAL PRIMARY KEY,
        city VARCHAR(100) UNIQUE NOT NULL,
        image_url TEXT,
        tagline VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const countryColumn = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'destinations' AND column_name = 'country'
       LIMIT 1`,
    );
    const hasCountry = countryColumn.rows.length > 0;

    await pool.query(
      `ALTER TABLE destinations ADD COLUMN IF NOT EXISTS region VARCHAR(100)`,
    );

    for (const city of seedCities) {
      const media = destinationMedia[city];
      if (hasCountry) {
        await pool.query(
          `INSERT INTO destinations (city, image_url, tagline, country)
           SELECT $1::varchar, $2::text, $3::varchar, 'Nepal'
           WHERE NOT EXISTS (
             SELECT 1 FROM destinations WHERE LOWER(city) = LOWER($1::varchar)
           )`,
          [city, media?.image_url || null, media?.tagline || null],
        );
      } else {
        await pool.query(
          `INSERT INTO destinations (city, image_url, tagline)
           SELECT $1::varchar, $2::text, $3::varchar
           WHERE NOT EXISTS (
             SELECT 1 FROM destinations WHERE LOWER(city) = LOWER($1::varchar)
           )`,
          [city, media?.image_url || null, media?.tagline || null],
        );
      }

      if (media) {
        await pool.query(
          `UPDATE destinations
           SET image_url = $2,
               tagline = $3
           WHERE LOWER(TRIM(city)) = LOWER(TRIM($1::text))`,
          [city, media.image_url, media.tagline],
        );
      }
    }

    // Backfill regions only when region is currently empty.
    const regionDefaults = [
      ["lukla", "Himalayan"],
      ["pokhara", "Mid-hills"],
      ["kathmandu", "Kathmandu Valley"],
      ["bharatpur", "Terai"],
      ["bhadrapur", "Terai"],
      ["nepalgunj", "Terai"],
      ["simara", "Terai"],
    ];
    for (const [cityKey, region] of regionDefaults) {
      await pool.query(
        `UPDATE destinations
         SET region = $2
         WHERE LOWER(TRIM(city)) = $1
           AND (region IS NULL OR TRIM(region) = '')`,
        [cityKey, region],
      );
    }

    console.log("Destinations migration complete");
    process.exit(0);
  } catch (err) {
    console.error("Destinations migration failed:", err.message);
    process.exit(1);
  }
}

migrateDestinations();
