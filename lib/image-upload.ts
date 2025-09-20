import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { NextRequest } from 'next/server';

export async function saveUploadedImage(
  file: File,
  directory: string = 'posts'
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      return { success: false, error: 'Only image files are allowed' };
    }

    // 파일 크기 검증 (5MB 제한)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return { success: false, error: 'File size must be less than 5MB' };
    }

    // 파일명 생성 (timestamp + random)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${randomString}.${fileExtension}`;

    // 업로드 디렉토리 생성
    const uploadDir = join(process.cwd(), 'public', 'uploads', directory);
    await mkdir(uploadDir, { recursive: true });

    // 파일 저장
    const filePath = join(uploadDir, fileName);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await writeFile(filePath, buffer);

    // 웹 접근 가능한 URL 생성
    const imageUrl = `/uploads/${directory}/${fileName}`;

    return { success: true, imageUrl };
  } catch (error) {
    console.error('Image upload error:', error);
    return { success: false, error: 'Failed to upload image' };
  }
}

export async function parseFormData(request: NextRequest): Promise<{
  fields: Record<string, string>;
  files: File[];
}> {
  try {
    const formData = await request.formData();
    const fields: Record<string, string> = {};
    const files: File[] = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      } else {
        fields[key] = value;
      }
    }

    return { fields, files };
  } catch (error) {
    console.error('Form data parsing error:', error);
    throw new Error('Failed to parse form data');
  }
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // 파일 타입 검증
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Only JPEG, PNG, and WebP images are allowed'
    };
  }

  // 파일 크기 검증 (5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image size must be less than 5MB'
    };
  }

  // 파일명 검증
  if (!file.name || file.name.length > 255) {
    return {
      valid: false,
      error: 'Invalid file name'
    };
  }

  return { valid: true };
}

export async function uploadMultipleImages(
  files: File[],
  directory: string = 'posts'
): Promise<{
  success: boolean;
  uploadedImages: string[];
  errors: string[];
}> {
  const uploadedImages: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      errors.push(`${file.name}: ${validation.error}`);
      continue;
    }

    const uploadResult = await saveUploadedImage(file, directory);
    if (uploadResult.success && uploadResult.imageUrl) {
      uploadedImages.push(uploadResult.imageUrl);
    } else {
      errors.push(`${file.name}: ${uploadResult.error}`);
    }
  }

  return {
    success: uploadedImages.length > 0,
    uploadedImages,
    errors
  };
}