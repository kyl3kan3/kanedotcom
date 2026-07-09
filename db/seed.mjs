import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
const ownerEmail = process.env.FAMILY_OWNER_EMAIL?.trim().toLowerCase();
const ownerName = process.env.FAMILY_OWNER_NAME?.trim() || "Family owner";
const hasExplicitOwnerName = Boolean(process.env.FAMILY_OWNER_NAME?.trim());

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!ownerEmail) throw new Error("FAMILY_OWNER_EMAIL is required.");

const sql = neon(databaseUrl);
const familyId = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";

await sql.transaction([
  sql`
    insert into families (id, name)
    values (${familyId}, 'Our Family')
    on conflict (id) do update
      set name = excluded.name, updated_at = now()
  `,
  sql`
    insert into family_members (
      id, family_id, invited_email, display_name, role, is_active
    ) values (
      ${ownerId}, ${familyId}, ${ownerEmail}, ${ownerName}, 'owner', 1
    )
    on conflict (id) do update
      set family_id = excluded.family_id,
          invited_email = excluded.invited_email,
          display_name = case
            when ${hasExplicitOwnerName} then excluded.display_name
            else family_members.display_name
          end,
          role = 'owner',
          is_active = 1,
          updated_at = now()
  `,
  sql`
    insert into trips (id, family_id, slug, title, sort_order)
    values
      ('20000000-0000-4000-8000-000000000001', ${familyId}, 'yellowstone', 'The Great Geyser Quest', 1),
      ('20000000-0000-4000-8000-000000000002', ${familyId}, 'beach', 'Operation Sandy Toes', 2),
      ('20000000-0000-4000-8000-000000000003', ${familyId}, 'chicago', 'The Snow-Day Expedition', 3),
      ('20000000-0000-4000-8000-000000000004', ${familyId}, 'farm', 'The Mud-Boot Weekend', 4)
    on conflict (family_id, slug) do update
      set title = excluded.title, sort_order = excluded.sort_order
  `,
]);

console.log(`Seeded Our Family, owner invite ${ownerEmail}, and 4 trips.`);
