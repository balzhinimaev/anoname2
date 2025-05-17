import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  gender?: 'male' | 'female' | 'other';
  preferences?: {
    gender?: 'male' | 'female' | 'any';
    ageRange?: {
      min: number;
      max: number;
    };
  };
  age?: number;
  photos?: string[];
  isActive: boolean;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  bio: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  preferences: {
    gender: { type: String, enum: ['male', 'female', 'any'] },
    ageRange: {
      min: { type: Number, min: 18 },
      max: { type: Number, max: 100 }
    }
  },
  age: { type: Number, min: 18 },
  photos: [{ type: String }],
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema); 