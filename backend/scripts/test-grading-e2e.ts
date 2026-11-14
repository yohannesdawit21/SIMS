import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GradesService } from '../src/modules/grades/grades.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';
import { EnrollmentService } from '../src/modules/students/enrollment.service';
import { DataSource } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { Course } from '../src/entities/course.entity';
import { AcademicPeriod } from '../src/entities/academic-period.entity';
import { StudentProfile } from '../src/entities/student-profile.entity';
import { Department } from '../src/entities/department.entity';
import { Grade } from '../src/entities/grade.entity';
import { FinalGrade } from '../src/entities/final-grade.entity';

async function runE2ETest() {
  console.log('🚀 Starting Institutional Grading Workflow End-to-End Test...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    const dataSource = app.get(DataSource);
    const gradesService = app.get(GradesService);
    const timetableService = app.get(TimetableService);
    const enrollmentService = app.get(EnrollmentService);

    const userRepo = dataSource.getRepository(User);
    const courseRepo = dataSource.getRepository(Course);
    const periodRepo = dataSource.getRepository(AcademicPeriod);
    const studentRepo = dataSource.getRepository(StudentProfile);
    const deptRepo = dataSource.getRepository(Department);

    // 1. Resolve Users & Entities
    const lecturer1 = await userRepo.findOne({ where: { username: 'lecturer1' } });
    if (!lecturer1) throw new Error('lecturer1 user not found');

    let hod = await userRepo.findOne({ where: { username: 'dephead1' } });
    if (!hod) {
      hod = await userRepo.findOne({ where: { username: 'hod.computing' } });
    }
    if (!hod) throw new Error('Department head user not found');

    const student1User = await userRepo.findOne({ where: { username: 'student1' } });
    if (!student1User) throw new Error('student1 user not found');
    const student1Profile = await studentRepo.findOne({ where: { user_id: student1User.id } });
    if (!student1Profile) throw new Error('student1 profile not found');

    const course = await courseRepo.findOne({ where: { code: 'CS101' } });
    if (!course) throw new Error('CS101 course not found');

    const periods = await periodRepo.find({ order: { start_date: 'DESC' } });
    if (!periods.length) throw new Error('No academic period found');
    const period = periods[0];

    // Clean previous test grades for CS101 so test is idempotent
    await dataSource.getRepository(Grade).delete({ course_id: course.id, academic_period_id: period.id });
    await dataSource.getRepository(FinalGrade).delete({ course_id: course.id, academic_period_id: period.id });

    console.log(`✓ Context resolved: Lecturer=${lecturer1.username}, HOD=${hod.username}, Student=${student1User.username}, Course=${course.code}, Period=${period.name}`);

    // Ensure department head link exists
    if (course.department_id) {
      const dept = await deptRepo.findOne({ where: { id: course.department_id } });
      if (dept && !dept.head_id) {
        dept.head_id = hod.id;
        await deptRepo.save(dept);
        console.log(`✓ Linked department ${dept.name} to HOD ${hod.username}`);
      }
    }

    // 2. Assign Course to Lecturer
    console.log('\n--- Step 1: Assigning Course to Lecturer ---');
    const assignResult = await timetableService.assignLecturerToCourse(
      {
        course_id: course.id,
        lecturer_id: lecturer1.id,
        academic_period_id: period.id,
      },
      hod.id,
      'department_head',
    );
    console.log(`✓ Course assignment verified: ${assignResult.message}`);

    // 3. Enroll Student to Course
    console.log('\n--- Step 2: Enrolling Student to Course ---');
    const enrollResult = await enrollmentService.enrollStudents(
      {
        course_id: course.id,
        academic_period_id: period.id,
        student_ids: [student1Profile.id],
      },
      hod.id,
    );
    console.log(`✓ Student enrollment verified: ${enrollResult.message}`);

    // 4. Lecturer Retrieves Grading Sheet
    console.log('\n--- Step 3: Lecturer Accesses Grading Sheet ---');
    const sheet = await gradesService.getCourseGradingSheet(course.id, period.id, lecturer1.id, 'lecturer');
    console.log(`✓ Grading sheet retrieved: ${sheet.roster.length} student(s), ${sheet.components.length} component(s)`);
    const studentRow = sheet.roster.find((s) => s.studentId === student1Profile.id);
    if (!studentRow) {
      throw new Error(`Student ${student1Profile.id} not present in grading sheet roster`);
    }

    // 5. Lecturer Enters Component Marks for all enrolled students
    console.log('\n--- Step 4: Lecturer Enters Component Marks ---');
    const caComp = sheet.components.find((c) => c.name.toLowerCase().includes('continuous') || c.name.toLowerCase().includes('ca')) || sheet.components[0];
    const feComp = sheet.components.find((c) => c.name.toLowerCase().includes('exam') || c.name.toLowerCase().includes('final')) || sheet.components[1];

    const gradesList: Array<{ studentId: string; componentId: string; score: number }> = [];
    for (const r of sheet.roster) {
      gradesList.push(
        { studentId: r.studentId, componentId: caComp.id, score: 36 },
        { studentId: r.studentId, componentId: feComp.id, score: 54 },
      );
    }

    await gradesService.batchEnterGrades(
      {
        courseId: course.id,
        periodId: period.id,
        grades: gradesList,
      },
      lecturer1.id,
      'lecturer',
    );
    console.log(`✓ Scores saved for ${sheet.roster.length} students: CA=36/40, FE=54/60`);

    // 6. Lecturer Submits Grades to HOD
    console.log('\n--- Step 5: Lecturer Submits Grades to HOD ---');
    const submitResult = await gradesService.submitGradesForApproval(course.id, period.id, lecturer1.id, 'lecturer');
    console.log(`✓ Submission successful: ${submitResult.message}`);

    // 7. HOD Checks Pending Moderation Queue
    console.log('\n--- Step 6: HOD Checks Pending Moderation Queue ---');
    const pendingList = await gradesService.getPendingSubmissionsForHOD(hod.id, 'department_head');
    const pendingEntry = pendingList.find((p) => p.courseId === course.id && p.academicPeriodId === period.id);
    if (!pendingEntry) {
      throw new Error('Course submission not found in HOD pending moderation queue');
    }
    console.log(`✓ Submission found in HOD queue: Course=${pendingEntry.courseCode}, Lecturer=${pendingEntry.lecturerName}`);

    // 8. HOD Approves and Publishes Grades
    console.log('\n--- Step 7: HOD Approves and Publishes Grades ---');
    const publishResult = await gradesService.publishGrades(course.id, period.id, true, hod.id, 'department_head');
    console.log(`✓ Publishing successful:`, publishResult);

    // 9. Student Verifies Final Grade & Breakdown
    console.log('\n--- Step 8: Student Verifies Final Grades & Breakdown ---');
    const transcript = await gradesService.getTranscript(student1Profile.id, student1User.id, 'student');
    const finalGrade = transcript.find((g: any) => g.course_id === course.id);
    if (!finalGrade) {
      throw new Error('Final grade not found on student transcript');
    }
    console.log(`✓ Student Final Grade: Score=${finalGrade.final_score}, Letter=${finalGrade.letter_grade}, Points=${finalGrade.grade_points}`);

    const breakdown = await gradesService.getStudentCourseBreakdown(course.id, period.id, student1Profile.id, student1User.id, 'student');
    console.log(`✓ Student Breakdown: Components=${breakdown.length}`);
    for (const comp of breakdown) {
      console.log(`   - ${comp.name}: Score=${comp.score}, Weight=${comp.weight}%, WeightedScore=${comp.weightedContribution}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL INSTITUTIONAL GRADING WORKFLOW STEPS PASSED! 🎉');
    console.log('======================================================\n');
  } finally {
    await app.close();
    process.exit(0);
  }
}

runE2ETest().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
