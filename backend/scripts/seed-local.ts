import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { Pool } from 'pg';

dotenv.config({ path: join(__dirname, '../.env') });

if (process.env.NODE_ENV === 'production' || process.env.SEED_LOCAL !== 'true') {
  throw new Error(
    'Local seed refused. Set NODE_ENV=development and SEED_LOCAL=true to run it.',
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const users = [
  {
    username: 'superadmin',
    email: 'superadmin@local.sims',
    role: 'super_admin',
    password: 'SuperAdmin@2016!',
  },
  {
    username: 'admin',
    email: 'admin@local.sims',
    role: 'admin_staff',
    password: 'Admin@2016!',
  },
  {
    username: 'hod.computing',
    email: 'hod.computing@local.sims',
    role: 'department_head',
    password: 'DeptHead@2016!',
  },
  {
    username: 'teacher.demo',
    email: 'teacher.demo@local.sims',
    role: 'lecturer',
    password: 'Teacher@2016!',
  },
  {
    username: 'lecturer1',
    email: 'lecturer1@local.sims',
    role: 'lecturer',
    password: 'Lecturer1@2016!',
  },
  {
    username: 'student.demo',
    email: 'student.demo@local.sims',
    role: 'student',
    password: 'Student@2016!',
  },
  {
    username: 'student1',
    email: 'student1@local.sims',
    role: 'student',
    password: 'Student@2016!',
  },
  {
    username: 'student2',
    email: 'student2@local.sims',
    role: 'student',
    password: 'Student@2016!',
  },
  {
    username: 'parent.demo',
    email: 'parent.demo@local.sims',
    role: 'parent_guardian',
    password: 'Parent@2016!',
  },
] as const;

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ids = new Map<string, string>();
    for (const account of users) {
      const id = randomUUID();
      const passwordHash = await bcrypt.hash(account.password, 12);
      const result = await client.query(
        `
          INSERT INTO users (id, username, password_hash, role, email, phone, is_active)
          VALUES ($1, $2, $3, $4, $5, NULL, TRUE)
          ON CONFLICT (username) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            email = EXCLUDED.email,
            is_active = TRUE,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
          RETURNING id
        `,
        [id, account.username, passwordHash, account.role, account.email],
      );
      ids.set(account.username, result.rows[0].id);
    }

    // 1. Department
    const department = await client.query(
      `
        INSERT INTO departments (name, head_id)
        VALUES ('Computing', $1)
        ON CONFLICT (name) DO UPDATE SET head_id = EXCLUDED.head_id
        RETURNING id
      `,
      [ids.get('hod.computing')],
    );
    const departmentId = department.rows[0].id;

    // 2. Programme
    const existingProgramme = await client.query(
      `SELECT id FROM programmes
       WHERE name = 'Computer Science' AND department_id = $1
       LIMIT 1`,
      [departmentId],
    );
    const programme = existingProgramme.rows[0]
      ? existingProgramme
      : await client.query(
          `
            INSERT INTO programmes (name, department_id, duration_years)
            VALUES ('Computer Science', $1, 4)
            RETURNING id
          `,
          [departmentId],
        );
    const programmeId = programme.rows[0].id;

    // 3. Academic Period
    const existingPeriod = await client.query(
      `SELECT id FROM academic_periods WHERE name = '2026/2027 - Semester 1' LIMIT 1`,
    );
    const period = existingPeriod.rows[0]
      ? existingPeriod
      : await client.query(
          `
            INSERT INTO academic_periods (name, start_date, end_date, is_locked)
            VALUES ('2026/2027 - Semester 1', '2026-09-01', '2027-01-31', FALSE)
            RETURNING id
          `,
        );
    const periodId = period.rows[0].id;

    // 4. Students
    const studentData = [
      {
        userId: ids.get('student.demo')!,
        num: 'STU-2016-00001',
        name: 'Demo Student',
        email: 'student.demo@local.sims',
        dob: '2000-01-01',
        nid: 'LOCAL-NATIONAL-ID-00001',
      },
      {
        userId: ids.get('student1')!,
        num: 'STU-2026-00101',
        name: 'Abebe Bikila',
        email: 'student1@local.sims',
        dob: '2002-05-14',
        nid: 'LOCAL-NATIONAL-ID-00101',
      },
      {
        userId: ids.get('student2')!,
        num: 'STU-2026-00102',
        name: 'Bethlehem Tadesse',
        email: 'student2@local.sims',
        dob: '2003-08-22',
        nid: 'LOCAL-NATIONAL-ID-00102',
      },
    ];

    const studentProfileIds: string[] = [];
    for (const s of studentData) {
      const res = await client.query(
        `
          INSERT INTO student_profiles (
            user_id, student_number, full_legal_name, date_of_birth,
            gender, national_id, phone, personal_email, home_address,
            programme_id, year_of_entry, status
          )
          VALUES ($1, $2, $3, $4, 'Other', $5, NULL, $6, 'Local development account', $7, 2026, 'active')
          ON CONFLICT (user_id) DO UPDATE SET
            programme_id = EXCLUDED.programme_id,
            status = 'active',
            student_number = EXCLUDED.student_number,
            full_legal_name = EXCLUDED.full_legal_name
          RETURNING id
        `,
        [s.userId, s.num, s.name, s.dob, s.nid, s.email, programmeId],
      );
      studentProfileIds.push(res.rows[0].id);
    }

    // 5. Courses
    const coursesData = [
      { code: 'CS101', name: 'Programming Fundamentals', credits: 3 },
      { code: 'CS102', name: 'Data Structures and Algorithms', credits: 4 },
      { code: 'CS103', name: 'Database Management Systems', credits: 3 },
    ];

    const courseIds: string[] = [];
    for (const c of coursesData) {
      const res = await client.query(
        `
          INSERT INTO courses (code, name, department_id, credit_hours)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id,
            credit_hours = EXCLUDED.credit_hours
          RETURNING id
        `,
        [c.code, c.name, departmentId, c.credits],
      );
      courseIds.push(res.rows[0].id);
    }

    // 6. Assign courses to lecturers (lecturer1 and teacher.demo)
    const lecturerUserIds = [ids.get('lecturer1')!, ids.get('teacher.demo')!];
    for (const lId of lecturerUserIds) {
      for (const cId of courseIds) {
        await client.query(
          `
            INSERT INTO course_lecturers (course_id, lecturer_id, academic_period_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (course_id, lecturer_id, academic_period_id) DO NOTHING
          `,
          [cId, lId, periodId],
        );
      }
    }

    // 7. Assessment components for each course
    for (const cId of courseIds) {
      const existingComp = await client.query(
        `SELECT id FROM assessment_components WHERE course_id = $1 LIMIT 1`,
        [cId],
      );
      if (existingComp.rows.length === 0) {
        await client.query(
          `
            INSERT INTO assessment_components (course_id, name, weight, is_mandatory)
            VALUES
              ($1, 'Continuous Assessment', 40.00, TRUE),
              ($1, 'Final Examination', 60.00, TRUE)
          `,
          [cId],
        );
      }
    }

    // 8. Enroll students into all courses for this period
    for (const sId of studentProfileIds) {
      for (const cId of courseIds) {
        await client.query(
          `
            INSERT INTO enrollments (student_id, course_id, academic_period_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (student_id, course_id, academic_period_id) DO NOTHING
          `,
          [sId, cId, periodId],
        );
      }
    }

    await client.query('COMMIT');

    console.log('Local SIMS database fully seeded!');
    console.log('Accounts:');
    for (const account of users) {
      console.log(`  ${account.role.padEnd(16)} ${account.username} / ${account.password}`);
    }
    console.log('\nAcademic Period: 2026/2027 - Semester 1');
    console.log('Courses assigned to lecturer1 & teacher.demo: CS101, CS102, CS103');
    console.log(`Enrolled students: ${studentProfileIds.length} students enrolled in all 3 courses`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
