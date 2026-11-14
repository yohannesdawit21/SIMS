/**
 * Credential Generator Utility
 * 
 * Generates usernames and passwords for new users (students, lecturers, staff)
 * according to the institution's naming conventions.
 */

import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

export interface GeneratedCredentials {
  username: string;
  password: string;
}

/**
 * Generate student username in format: STU{YEAR}{SEQUENCE}
 * Example: STU2024001, STU2024002, etc.
 * 
 * @param userRepository - Repository to check for existing usernames
 * @returns Promise with generated username
 */
export async function generateStudentUsername(
  userRepository: Repository<User>,
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `STU${currentYear}`;

  // Find the highest sequence number for this year
  const lastUser = await userRepository
    .createQueryBuilder('user')
    .where('user.username LIKE :pattern', { pattern: `${prefix}%` })
    .orderBy('user.username', 'DESC')
    .getOne();

  let sequence = 1;
  if (lastUser) {
    // Extract sequence number from last username
    const lastSequence = lastUser.username.substring(prefix.length);
    sequence = parseInt(lastSequence, 10) + 1;
  }

  // Pad sequence to 3 digits
  const paddedSequence = sequence.toString().padStart(3, '0');
  return `${prefix}${paddedSequence}`;
}

/**
 * Generate lecturer username in format: LEC{YEAR}{SEQUENCE}
 * Example: LEC2024001, LEC2024002, etc.
 * 
 * @param userRepository - Repository to check for existing usernames
 * @returns Promise with generated username
 */
export async function generateLecturerUsername(
  userRepository: Repository<User>,
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `LEC${currentYear}`;

  // Find the highest sequence number for this year
  const lastUser = await userRepository
    .createQueryBuilder('user')
    .where('user.username LIKE :pattern', { pattern: `${prefix}%` })
    .orderBy('user.username', 'DESC')
    .getOne();

  let sequence = 1;
  if (lastUser) {
    // Extract sequence number from last username
    const lastSequence = lastUser.username.substring(prefix.length);
    sequence = parseInt(lastSequence, 10) + 1;
  }

  // Pad sequence to 3 digits
  const paddedSequence = sequence.toString().padStart(3, '0');
  return `${prefix}${paddedSequence}`;
}

/**
 * Generate staff username in format: STF{YEAR}{SEQUENCE}
 * Example: STF2024001, STF2024002, etc.
 * 
 * @param userRepository - Repository to check for existing usernames
 * @returns Promise with generated username
 */
export async function generateStaffUsername(
  userRepository: Repository<User>,
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `STF${currentYear}`;

  // Find the highest sequence number for this year
  const lastUser = await userRepository
    .createQueryBuilder('user')
    .where('user.username LIKE :pattern', { pattern: `${prefix}%` })
    .orderBy('user.username', 'DESC')
    .getOne();

  let sequence = 1;
  if (lastUser) {
    // Extract sequence number from last username
    const lastSequence = lastUser.username.substring(prefix.length);
    sequence = parseInt(lastSequence, 10) + 1;
  }

  // Pad sequence to 3 digits
  const paddedSequence = sequence.toString().padStart(3, '0');
  return `${prefix}${paddedSequence}`;
}

/**
 * Generate password from last 6 digits of national ID
 * Used for students per institutional policy
 * 
 * @param nationalId - Student's national ID number
 * @returns Generated password
 */
export function generatePasswordFromNationalId(nationalId: string): string {
  // Remove any non-alphanumeric characters
  const cleanId = nationalId.replace(/[^a-zA-Z0-9]/g, '');
  
  if (cleanId.length < 6) {
    throw new Error('National ID must be at least 6 characters long');
  }

  // Return last 6 characters
  return cleanId.slice(-6);
}

/**
 * Generate random alphanumeric password
 * Used for lecturers and staff
 * 
 * @param length - Password length (default 8)
 * @returns Random password
 */
export function generateRandomPassword(length: number = 8): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  
  // Ensure at least one uppercase, one lowercase, and one number
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  
  // Fill the rest randomly
  for (let i = 3; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate complete credentials for a student
 * 
 * @param userRepository - User repository
 * @param nationalId - Student's national ID
 * @returns Generated username and password
 */
export async function generateStudentCredentials(
  userRepository: Repository<User>,
  nationalId: string,
): Promise<GeneratedCredentials> {
  const username = await generateStudentUsername(userRepository);
  const password = generatePasswordFromNationalId(nationalId);
  
  return { username, password };
}

/**
 * Generate complete credentials for a lecturer
 * 
 * @param userRepository - User repository
 * @returns Generated username and password
 */
export async function generateLecturerCredentials(
  userRepository: Repository<User>,
): Promise<GeneratedCredentials> {
  const username = await generateLecturerUsername(userRepository);
  const password = generateRandomPassword(8);
  
  return { username, password };
}

/**
 * Generate complete credentials for an admin staff
 * 
 * @param userRepository - User repository
 * @returns Generated username and password
 */
export async function generateStaffCredentials(
  userRepository: Repository<User>,
): Promise<GeneratedCredentials> {
  const username = await generateStaffUsername(userRepository);
  const password = generateRandomPassword(8);
  
  return { username, password };
}
