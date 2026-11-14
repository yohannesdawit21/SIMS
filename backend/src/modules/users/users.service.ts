import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';

import { User, UserRole } from '../../entities/user.entity';
import { Department } from '../../entities/department.entity';
import { REDIS_CLIENT } from '../../common/providers/redis.provider';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RegisterHODDto } from './dto/register-hod.dto';
import { generateLecturerCredentials, generateStaffCredentials } from '../../common/utils/credential-generator';

const BCRYPT_WORK_FACTOR = 12;

/**
 * UsersService — CRUD for user accounts and role assignments.
 *
 * Key behaviours:
 *  - create(): hash password, insert user, write audit log.
 *  - registerHOD(): create department head user and associate with department.
 *  - findAll(): list all users (Super Admin scoped, no password data).
 *  - findOne(): fetch single user or throw 404.
 *  - update(): update allowed fields; on role change → update Redis session +
 *              write audit log entry with previous/new role.
 *  - deactivate(): set is_active = false, DEL Redis session, write audit log.
 *
 * Requirements: 1.3, 1.5, 1.6, 1.8
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a new user account.
   * Requirement 1.3
   */
  async create(dto: CreateUserDto, actorId: string): Promise<Omit<User, 'password_hash'>> {
    // Check for duplicate username or email
    const existing = await this.userRepository.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });

    if (existing) {
      const field =
        existing.username === dto.username ? 'username' : 'email';
      throw new ConflictException(
        `A user with that ${field} already exists.`,
      );
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_WORK_FACTOR);

    const user = this.userRepository.create({
      username: dto.username,
      password_hash,
      role: dto.role,
      email: dto.email,
      phone: dto.phone ?? null,
      is_active: true,
    });

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'users',
      recordId: saved.id,
      newValues: {
        username: saved.username,
        role: saved.role,
        email: saved.email,
        is_active: saved.is_active,
      },
    });

    this.logger.log(`User created: ${saved.id} (${saved.username}) by actor ${actorId}`);
    return this.stripPasswordHash(saved);
  }

  /**
   * Create a new lecturer account with auto-generated credentials.
   * Username format: LEC2024001
   * Password: Random 8-character alphanumeric
   * Returns the plaintext password for admin to share with the lecturer.
   */
  async createLecturer(
    dto: { email: string; phone?: string },
    actorId: string,
  ): Promise<Omit<User, 'password_hash'> & { temporary_password: string }> {
    // Check for duplicate email
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('A user with that email already exists.');
    }

    // Auto-generate credentials
    const credentials = await generateLecturerCredentials(this.userRepository);

    const password_hash = await bcrypt.hash(credentials.password, BCRYPT_WORK_FACTOR);

    const user = this.userRepository.create({
      username: credentials.username,
      password_hash,
      role: UserRole.LECTURER,
      email: dto.email,
      phone: dto.phone ?? null,
      is_active: true,
    });

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'users',
      recordId: saved.id,
      newValues: {
        username: saved.username,
        role: saved.role,
        email: saved.email,
        is_active: saved.is_active,
      },
    });

    this.logger.log(
      `Lecturer created: ${saved.id} (${saved.username}) by actor ${actorId}`,
    );

    return {
      ...this.stripPasswordHash(saved),
      temporary_password: credentials.password, // Plaintext for display/email
    };
  }

  /**
   * Create a new admin staff account with auto-generated credentials.
   * Username format: STF2024001
   * Password: Random 8-character alphanumeric
   * Returns the plaintext password for super admin to share with the staff.
   */
  async createStaff(
    dto: { email: string; phone?: string },
    actorId: string,
  ): Promise<Omit<User, 'password_hash'> & { temporary_password: string }> {
    // Check for duplicate email
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('A user with that email already exists.');
    }

    // Auto-generate credentials
    const credentials = await generateStaffCredentials(this.userRepository);

    const password_hash = await bcrypt.hash(credentials.password, BCRYPT_WORK_FACTOR);

    const user = this.userRepository.create({
      username: credentials.username,
      password_hash,
      role: UserRole.ADMIN_STAFF,
      email: dto.email,
      phone: dto.phone ?? null,
      is_active: true,
    });

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'users',
      recordId: saved.id,
      newValues: {
        username: saved.username,
        role: saved.role,
        email: saved.email,
        is_active: saved.is_active,
      },
    });

    this.logger.log(
      `Admin staff created: ${saved.id} (${saved.username}) by actor ${actorId}`,
    );

    return {
      ...this.stripPasswordHash(saved),
      temporary_password: credentials.password, // Plaintext for display/email
    };
  }

  /**
   * Register a new Head of Department and assign them to an existing or new department.
   */
  async registerHOD(
    dto: RegisterHODDto,
    actorId: string,
  ): Promise<{
    user: Omit<User, 'password_hash'>;
    department: Department;
    credentials: { username: string; email: string; role: string };
  }> {
    // 1. Verify username/email uniqueness
    const existing = await this.userRepository.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) {
      const field = existing.username === dto.username ? 'username' : 'email';
      throw new ConflictException(`A user with that ${field} already exists.`);
    }

    // 2. Resolve department
    let department: Department | null = null;
    if (dto.department_id) {
      department = await this.departmentRepository.findOne({ where: { id: dto.department_id } });
      if (!department) {
        throw new NotFoundException(`Department with ID "${dto.department_id}" not found.`);
      }
    } else if (dto.department_name && dto.department_name.trim().length > 0) {
      const trimmedName = dto.department_name.trim();
      department = await this.departmentRepository.findOne({ where: { name: trimmedName } });
      if (!department) {
        department = await this.departmentRepository.save(
          this.departmentRepository.create({ name: trimmedName }),
        );
      }
    } else {
      throw new BadRequestException('Either an existing department_id or department_name must be provided.');
    }

    // 3. Create HOD User
    const password_hash = await bcrypt.hash(dto.password, BCRYPT_WORK_FACTOR);
    const user = this.userRepository.create({
      username: dto.username,
      password_hash,
      role: UserRole.DEPARTMENT_HEAD,
      email: dto.email,
      phone: dto.phone ?? null,
      is_active: true,
    });
    const savedUser = await this.userRepository.save(user);

    // 4. Link Department Head
    department.head_id = savedUser.id;
    await this.departmentRepository.save(department);

    // 5. Audit Log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'users',
      recordId: savedUser.id,
      newValues: {
        username: savedUser.username,
        role: savedUser.role,
        email: savedUser.email,
        department_id: department.id,
        department_name: department.name,
      },
    });

    this.logger.log(`Head of Department registered: ${savedUser.username} for department: ${department.name}`);

    return {
      user: this.stripPasswordHash(savedUser),
      department,
      credentials: {
        username: savedUser.username,
        email: savedUser.email,
        role: UserRole.DEPARTMENT_HEAD,
      },
    };
  }

  /**
   * Promote a lecturer to department head role.
   * Updates user.role to 'department_head' and sets department.head_id.
   * Requirement: per user request - super admin can grant department head authority.
   */
  async promoteToDepartmentHead(
    userId: string,
    departmentId: string,
    actorId: string,
  ): Promise<{
    user: Omit<User, 'password_hash'>;
    department: Department;
    message: string;
  }> {
    // 1. Get the user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found.`);
    }

    // 2. Check if user is already a department head
    if (user.role === UserRole.DEPARTMENT_HEAD) {
      throw new BadRequestException('User is already a department head.');
    }

    // 3. Check if user is a lecturer (typically promote from lecturer)
    if (user.role !== UserRole.LECTURER) {
      throw new BadRequestException(
        'Only lecturers can be promoted to department head.',
      );
    }

    // 4. Get the department
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
      relations: ['head'],
    });
    if (!department) {
      throw new NotFoundException(`Department with id "${departmentId}" not found.`);
    }

    // 5. Check if department already has a head
    if (department.head_id) {
      throw new BadRequestException(
        `Department "${department.name}" already has a head. Please demote the current head first.`,
      );
    }

    // 6. Update user role
    user.role = UserRole.DEPARTMENT_HEAD;
    const savedUser = await this.userRepository.save(user);

    // 7. Link department to new head
    department.head_id = savedUser.id;
    await this.departmentRepository.save(department);

    // 8. Update Redis session if user is logged in (optional, skip Redis errors)
    try {
      await this.updateRedisSessionRole(userId, UserRole.DEPARTMENT_HEAD);
    } catch (error) {
      this.logger.warn(
        `Could not update Redis session for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 9. Audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'users',
      recordId: userId,
      previousValues: { role: UserRole.LECTURER },
      newValues: {
        role: UserRole.DEPARTMENT_HEAD,
        department_id: departmentId,
        department_name: department.name,
        event: 'PROMOTED_TO_DEPT_HEAD',
      },
    });

    this.logger.log(
      `User ${userId} (${user.username}) promoted to Department Head of ${department.name} by actor ${actorId}`,
    );

    return {
      user: this.stripPasswordHash(savedUser),
      department,
      message: `${user.username} has been promoted to Head of ${department.name}`,
    };
  }

  /**
   * Demote a department head back to lecturer role.
   * Requires providing a new head for the department.
   * Requirement: per user request - super admin can revoke department head authority.
   */
  async demoteFromDepartmentHead(
    userId: string,
    newHeadId: string,
    actorId: string,
  ): Promise<{
    demotedUser: Omit<User, 'password_hash'>;
    newHead: Omit<User, 'password_hash'>;
    department: Department;
    message: string;
  }> {
    // 1. Get the user being demoted
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found.`);
    }

    // 2. Check if user is actually a department head
    if (user.role !== UserRole.DEPARTMENT_HEAD) {
      throw new BadRequestException('User is not a department head.');
    }

    // 3. Find the department this user heads
    const department = await this.departmentRepository.findOne({
      where: { head_id: userId },
    });
    if (!department) {
      throw new NotFoundException(
        `No department found with user ${userId} as head.`,
      );
    }

    // 4. Get the new head
    const newHead = await this.userRepository.findOne({
      where: { id: newHeadId },
    });
    if (!newHead) {
      throw new NotFoundException(`New head with id "${newHeadId}" not found.`);
    }

    // 5. Check if new head is a lecturer
    if (newHead.role !== UserRole.LECTURER) {
      throw new BadRequestException(
        'New head must be a lecturer. Please promote them to lecturer first if needed.',
      );
    }

    // 6. Demote current head to lecturer
    user.role = UserRole.LECTURER;
    const savedUser = await this.userRepository.save(user);

    // 7. Promote new head
    newHead.role = UserRole.DEPARTMENT_HEAD;
    const savedNewHead = await this.userRepository.save(newHead);

    // 8. Update department head
    department.head_id = newHeadId;
    await this.departmentRepository.save(department);

    // 9. Update Redis sessions (optional, skip errors)
    try {
      await this.updateRedisSessionRole(userId, UserRole.LECTURER);
      await this.updateRedisSessionRole(newHeadId, UserRole.DEPARTMENT_HEAD);
    } catch (error) {
      this.logger.warn(
        `Could not update Redis sessions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 10. Audit logs
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'users',
      recordId: userId,
      previousValues: { role: UserRole.DEPARTMENT_HEAD },
      newValues: {
        role: UserRole.LECTURER,
        event: 'DEMOTED_FROM_DEPT_HEAD',
        department_id: department.id,
        department_name: department.name,
      },
    });

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'users',
      recordId: newHeadId,
      previousValues: { role: UserRole.LECTURER },
      newValues: {
        role: UserRole.DEPARTMENT_HEAD,
        event: 'PROMOTED_TO_DEPT_HEAD',
        department_id: department.id,
        department_name: department.name,
      },
    });

    this.logger.log(
      `User ${userId} (${user.username}) demoted from Department Head. New head: ${newHeadId} (${newHead.username}) for ${department.name} by actor ${actorId}`,
    );

    return {
      demotedUser: this.stripPasswordHash(savedUser),
      newHead: this.stripPasswordHash(savedNewHead),
      department,
      message: `${user.username} has been demoted. ${newHead.username} is now Head of ${department.name}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * List all users — Super Admin only (enforced by controller).
   * Supports optional text filter on username or email.
   * Requirement 1.3
   */
  async findAll(filter?: { username?: string; email?: string; role?: UserRole }): Promise<Omit<User, 'password_hash'>[]> {
    const qb = this.userRepository.createQueryBuilder('u');

    if (filter?.username) {
      qb.andWhere('u.username ILIKE :username', {
        username: `%${filter.username}%`,
      });
    }
    if (filter?.email) {
      qb.andWhere('u.email ILIKE :email', { email: `%${filter.email}%` });
    }
    if (filter?.role) {
      qb.andWhere('u.role = :role', { role: filter.role });
    }

    qb.orderBy('u.created_at', 'DESC');

    const users = await qb.getMany();
    return users.map((u: any) => this.stripPasswordHash(u));
  }

  /**
   * Get a single user by ID or throw 404.
   * Requirement 1.3
   */
  async findOne(id: string): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }
    return this.stripPasswordHash(user);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update user fields. If role changes:
   *   1. Update the Redis session payload with the new role so the next
   *      request picks it up immediately (Req 1.5, 1.7).
   *   2. Write an audit log entry capturing previous and new role (Req 1.6).
   *
   * Requirements: 1.3, 1.5, 1.6
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }

    const previousRole = user.role;
    const roleChanged = dto.role !== undefined && dto.role !== previousRole;

    // Check email uniqueness if email is being changed
    if (dto.email && dto.email !== user.email) {
      const emailConflict = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (emailConflict) {
        throw new ConflictException('A user with that email already exists.');
      }
    }

    // Apply updates
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.is_active !== undefined) user.is_active = dto.is_active;
    if (dto.password !== undefined) {
      user.password_hash = await bcrypt.hash(dto.password, BCRYPT_WORK_FACTOR);
    }

    const updated = await this.userRepository.save(user);

    // Role change handling — Req 1.5, 1.6
    if (roleChanged) {
      // Update the live Redis session with the new role so it takes effect
      // on the user's very next request (Req 1.5, 1.7).
      await this.updateRedisSessionRole(id, dto.role as UserRole);

      // Write role-change audit entry (Req 1.6)
      await this.auditService.log({
        actorId,
        operation: AuditOperation.UPDATE,
        recordType: 'users',
        recordId: id,
        previousValues: { role: previousRole },
        newValues: {
          role: dto.role,
          event: 'ROLE_CHANGED',
          affectedUserId: id,
        },
      });

      this.logger.log(
        `Role changed for user ${id}: ${previousRole} → ${dto.role} by actor ${actorId}`,
      );
    } else {
      // General update audit entry
      await this.auditService.log({
        actorId,
        operation: AuditOperation.UPDATE,
        recordType: 'users',
        recordId: id,
        previousValues: {
          email: user.email,
          phone: user.phone,
          is_active: user.is_active,
        },
        newValues: {
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        },
      });
    }

    return this.stripPasswordHash(updated);
  }

  // ---------------------------------------------------------------------------
  // Deactivate
  // ---------------------------------------------------------------------------

  /**
   * Deactivate a user account:
   *   1. Set is_active = false.
   *   2. DEL the Redis session key to immediately invalidate any active session
   *      (Req 1.8 — next JWT validation will fail because session key is gone).
   *   3. Write an audit log entry.
   *
   * Requirements: 1.8
   */
  async deactivate(id: string, actorId: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found.`);
    }

    if (!user.is_active) {
      return { message: 'User account is already deactivated.' };
    }

    await this.userRepository.update(id, { is_active: false });

    // Immediately invalidate the active Redis session (Req 1.8) - optional
    try {
      const sessionKey = `user:${id}:session`;
      const deleted = (this.redis && this.redis.status === "ready") ? await this.redis.del(sessionKey) : 0;
      this.logger.log(
        `Session key "${sessionKey}" deleted (keys removed: ${deleted}) for deactivated user ${id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete Redis session for deactivated user ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Audit log (Req 1.6, 1.8)
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'users',
      recordId: id,
      previousValues: { is_active: true },
      newValues: {
        is_active: false,
        event: 'ACCOUNT_DEACTIVATED',
        affectedUserId: id,
      },
    });

    this.logger.log(`User ${id} deactivated by actor ${actorId}`);
    return { message: 'User account deactivated successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Update the role field inside the stored Redis session payload.
   * The session is a JSON blob; we parse it, update role, and write it back
   * with the remaining TTL preserved.
   *
   * Requirement 1.5, 1.7
   */
  private async updateRedisSessionRole(
    userId: string,
    newRole: UserRole,
  ): Promise<void> {
    const sessionKey = `user:${userId}:session`;
    try {
      const raw = (this.redis && this.redis.status === "ready") ? await this.redis.get(sessionKey) : null;
      if (!raw) {
        // No active session — nothing to update
        return;
      }

      const ttl = await this.redis.ttl(sessionKey);
      const session = JSON.parse(raw) as Record<string, unknown>;
      session['role'] = newRole;

      if (ttl > 0) {
        await this.redis.set(sessionKey, JSON.stringify(session), 'EX', ttl);
      } else {
        // TTL not available / key has no expiry — just update
        await this.redis.set(sessionKey, JSON.stringify(session));
      }

      this.logger.log(
        `Redis session for user ${userId} updated with new role: ${newRole}`,
      );
    } catch (err) {
      // Non-fatal: log and continue. The guard re-reads role on each request
      // so the next token refresh will carry the correct role.
      this.logger.warn(
        `Failed to update Redis session role for user ${userId}: ${String(err)}`,
      );
    }
  }

  /**
   * Remove password_hash from the returned object — never expose hashes.
   */
  private stripPasswordHash(user: User): Omit<User, 'password_hash'> {
    const { password_hash: _ph, ...safe } = user;
    return safe as Omit<User, 'password_hash'>;
  }
}
