import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/modules/users/users.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';
import { EnrollmentService } from '../src/modules/students/enrollment.service';
import { GradesService } from '../src/modules/grades/grades.service';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../src/entities/user.entity';
import { Department } from '../src/entities/department.entity';
import { Course } from '../src/entities/course.entity';
import { AcademicPeriod } from '../src/entities/academic-period.entity';
import { StudentProfile } from '../src/entities/student-profile.entity';
import { Grade } from '../src/entities/grade.entity';
import { FinalGrade } from '../src/entities/final-grade.entity';

async function runSuperAdminHODWorkflowTest() {
  console.log('🚀 Starting Super Admin -> HOD -> Teacher -> Student Workflow E2E Test...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const dataSource = app.get(DataSource);
    const usersService = app.get(UsersService);
    const timetableService = app.get(TimetableService);
    const enrollmentService = app.get(EnrollmentService);
    const gradesService = app.get(GradesService);

    const userRepo = dataSource.getRepository(User);
    const deptRepo = dataSource.getRepository(Department);
    const courseRepo = dataSource.getRepository(Course);
    const periodRepo = dataSource.getRepository(AcademicPeriod);
    const studentRepo = dataSource.getRepository(StudentProfile);

    // 0. Clean up previous test artifacts if re-running
    const testDeptName = 'Mechanical Engineering Test';
    const testHodUsername = 'hod_mech_test';
    const testCourseCode = 'ME101';

    const oldCourse = await courseRepo.findOne({ where: { code: testCourseCode } });
    if (oldCourse) {
      await dataSource.getRepository(Grade).delete({ course_id: oldCourse.id });
      await dataSource.getRepository(FinalGrade).delete({ course_id: oldCourse.id });
      await courseRepo.delete({ id: oldCourse.id });
    }
    const oldHod = await userRepo.findOne({ where: { username: testHodUsername } });
    if (oldHod) {
      await deptRepo.delete({ head_id: oldHod.id });
      await userRepo.delete({ id: oldHod.id });
    }
    await deptRepo.delete({ name: testDeptName });

    // Resolve SuperAdmin, Lecturer, and Student
    const superadmin = await userRepo.findOne({ where: { role: UserRole.SUPER_ADMIN } });
    if (!superadmin) throw new Error('Superadmin user not found');

    const lecturer1 = await userRepo.findOne({ where: { username: 'lecturer1' } });
    if (!lecturer1) throw new Error('lecturer1 user not found');

    const student1User = await userRepo.findOne({ where: { username: 'student1' } });
    if (!student1User) throw new Error('student1 user not found');
    const student1Profile = await studentRepo.findOne({ where: { user_id: student1User.id } });
    if (!student1Profile) throw new Error('student1 profile not found');

    const periods = await periodRepo.find({ order: { start_date: 'DESC' } });
    if (!periods.length) throw new Error('Academic period not found');
    const period = periods[0];

    console.log(`✓ Context resolved: SuperAdmin=${superadmin.username}, Lecturer=${lecturer1.username}, Student=${student1User.username}, Period=${period.name}`);

    // =========================================================================
    // Step 1: Super Admin Registers Head of Department & Department
    // =========================================================================
    console.log('\n--- Step 1: Super Admin Registers Head of Department ---');
    const hodResult = await usersService.registerHOD(
      {
        username: testHodUsername,
        email: 'hod.mech.test@sims.edu',
        password: 'DeptHead@2016!',
        department_name: testDeptName,
        phone: '+251 91 100 2000',
      },
      superadmin.id,
    );
    console.log(`✓ HOD Created: User=${hodResult.user.username}, Role=${hodResult.user.role}, Dept=${hodResult.department.name}`);

    // Verify HOD is linked in database
    const savedDept = await deptRepo.findOne({ where: { id: hodResult.department.id }, relations: ['head'] });
    if (!savedDept || savedDept.head_id !== hodResult.user.id) {
      throw new Error('Department head_id was not properly linked to newly created HOD');
    }
    console.log(`✓ Database link verified: Department "${savedDept.name}" head_id is "${savedDept.head_id}"`);

    // =========================================================================
    // Step 2: Head of Department Registers Course & Assigns Lecturer
    // =========================================================================
    console.log('\n--- Step 2: HOD Registers Course and Assigns Lecturer ---');
    const courseResult = await timetableService.registerCourse(
      {
        code: testCourseCode,
        name: 'Engineering Mechanics',
        credit_hours: 3,
        max_enrollment: 60,
        lecturer_id: lecturer1.id,
        academic_period_id: period.id,
      },
      hodResult.user.id,
      'department_head',
    );
    console.log(`✓ Course registered: ${courseResult.course.code} (${courseResult.course.name}), Lecturer assigned=${lecturer1.username}`);

    // =========================================================================
    // Step 3: Head of Department Enrolls Students
    // =========================================================================
    console.log('\n--- Step 3: HOD Enrolls Students into Course ---');
    const enrollResult = await enrollmentService.enrollStudents(
      {
        course_id: courseResult.course.id,
        academic_period_id: period.id,
        student_ids: [student1Profile.id],
      },
      hodResult.user.id,
    );
    console.log(`✓ Enrollment confirmed: ${enrollResult.message}`);

    // =========================================================================
    // Step 4: Lecturer Enters Marks & Submits to HOD
    // =========================================================================
    console.log('\n--- Step 4: Lecturer Enters Scores and Submits to HOD ---');
    const sheet = await gradesService.getCourseGradingSheet(
      courseResult.course.id,
      period.id,
      lecturer1.id,
      'lecturer',
    );
    console.log(`✓ Grading sheet retrieved: ${sheet.roster.length} student(s), ${sheet.components.length} component(s)`);

    const caComp = sheet.components.find((c) => c.name.toLowerCase().includes('continuous') || c.name.toLowerCase().includes('ca')) || sheet.components[0];
    const feComp = sheet.components.find((c) => c.name.toLowerCase().includes('exam') || c.name.toLowerCase().includes('final')) || sheet.components[1];

    await gradesService.batchEnterGrades(
      {
        courseId: courseResult.course.id,
        periodId: period.id,
        grades: [
          { studentId: student1Profile.id, componentId: caComp.id, score: 38 }, // 38/40
          { studentId: student1Profile.id, componentId: feComp.id, score: 56 }, // 56/60 -> Total = 94% (Grade A)
        ],
      },
      lecturer1.id,
      'lecturer',
    );
    console.log('✓ Scores saved: CA=38/40, FE=56/60');

    const submitResult = await gradesService.submitGradesForApproval(
      courseResult.course.id,
      period.id,
      lecturer1.id,
      'lecturer',
    );
    console.log(`✓ Submission to HOD successful: ${submitResult.message}`);

    // =========================================================================
    // Step 5: HOD Moderates & Publishes Grades
    // =========================================================================
    console.log('\n--- Step 5: HOD Reviews and Publishes Grades ---');
    const pendingSubmissions = await gradesService.getPendingSubmissionsForHOD(
      hodResult.user.id,
      'department_head',
    );
    const pendingItem = pendingSubmissions.find((p) => p.courseId === courseResult.course.id);
    if (!pendingItem) {
      throw new Error(`Submission for ${testCourseCode} not found in HOD pending queue`);
    }
    console.log(`✓ Verified in HOD queue: Course=${pendingItem.courseCode}, Lecturer=${pendingItem.lecturerName}`);

    const publishResult = await gradesService.publishGrades(
      courseResult.course.id,
      period.id,
      true,
      hodResult.user.id,
      'department_head',
    );
    console.log(`✓ Grades approved and published:`, publishResult);

    // =========================================================================
    // Step 6: Student Verifies Published Result and Breakdown
    // =========================================================================
    console.log('\n--- Step 6: Student Verifies Published Grade ---');
    const transcript = await gradesService.getTranscript(
      student1Profile.id,
      student1User.id,
      'student',
    );
    const publishedGrade = transcript.find((g: any) => g.course_id === courseResult.course.id);
    if (!publishedGrade) {
      throw new Error('Published final grade not found in student transcript');
    }
    console.log(`✓ Student Transcript Grade: Score=${publishedGrade.final_score}, Letter=${publishedGrade.letter_grade}, Points=${publishedGrade.grade_points}`);

    const breakdown = await gradesService.getStudentCourseBreakdown(
      courseResult.course.id,
      period.id,
      student1Profile.id,
      student1User.id,
      'student',
    );
    console.log(`✓ Itemized Breakdown (${breakdown.length} components):`);
    for (const comp of breakdown) {
      console.log(`   - ${comp.name}: Score=${comp.score}, Weight=${comp.weight}%, Contribution=${comp.weightedContribution}`);
    }

    console.log('\n================================================================');
    console.log('🎉 FULL SUPERADMIN -> HOD -> TEACHER -> STUDENT WORKFLOW PASSED! 🎉');
    console.log('================================================================\n');
  } catch (err) {
    console.error('❌ Workflow Test Failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runSuperAdminHODWorkflowTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ Workflow Test Failed:', err);
  process.exit(1);
});
