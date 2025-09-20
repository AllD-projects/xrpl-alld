import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { parseFormData, uploadMultipleImages } from '@/lib/image-upload';

const prisma = new PrismaClient();

// 게시글에 이미지 추가
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const me = await requireAuth();
    const { postId } = params;

    // 게시글 존재 및 권한 확인
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        images: true
      }
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.authorId !== me.id) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    // 현재 이미지 수 확인 (최대 5개)
    if (post.images.length >= 5) {
      return NextResponse.json(
        { error: 'Maximum 5 images allowed per post' },
        { status: 400 }
      );
    }

    const { files } = await parseFormData(request);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    // 총 이미지 수 확인
    if (post.images.length + files.length > 5) {
      return NextResponse.json(
        { error: `Can only add ${5 - post.images.length} more images` },
        { status: 400 }
      );
    }

    // 이미지 업로드
    const uploadResult = await uploadMultipleImages(files, 'posts');

    if (uploadResult.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Image upload failed',
          details: uploadResult.errors
        },
        { status: 400 }
      );
    }

    // 데이터베이스에 이미지 정보 추가
    const currentMaxPosition = post.images.length > 0
      ? Math.max(...post.images.map(img => img.position))
      : -1;

    const newImages = await prisma.$transaction(
      uploadResult.uploadedImages.map((imageUrl, index) =>
        prisma.postImage.create({
          data: {
            postId: postId,
            imageUrl,
            position: currentMaxPosition + 1 + index,
            alt: `${post.title} - Image ${currentMaxPosition + 2 + index}`
          }
        })
      )
    );

    return NextResponse.json({
      success: true,
      images: newImages,
      message: `${newImages.length} image(s) added successfully`
    });
  } catch (error) {
    console.error('Post image addition error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 게시글 이미지 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const me = await requireAuth();
    const { postId } = params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

    // 게시글 존재 및 권한 확인
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.authorId !== me.id) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    // 이미지 존재 확인
    const image = await prisma.postImage.findUnique({
      where: {
        id: imageId,
        postId: postId
      }
    });

    if (!image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    // 이미지 삭제
    await prisma.postImage.delete({
      where: { id: imageId }
    });

    // TODO: 실제 파일 시스템에서도 이미지 파일 삭제
    // const fs = require('fs').promises;
    // const path = require('path');
    // const filePath = path.join(process.cwd(), 'public', image.imageUrl);
    // await fs.unlink(filePath).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Post image deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}