/**
 * Express Request type augmentation
 * Extends the Express Request interface to include our custom user property
 */

/// <reference types="multer" />
import { RequestUser } from '../auth/interfaces/user.interface';


declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}
