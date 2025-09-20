import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { parseFormData, uploadMultipleImages, validateImageFile } from '@/lib/image-upload';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const me = await requireAuth();

    const contentType = request.headers.get('content-type') || '';

    // Form data (이미지 업로드 포함)
    if (contentType.includes('multipart/form-data')) {
      const { fields, files } = await parseFormData(request);

      const { title, description } = fields;

      if (!title || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        );
      }

      if (title.length > 200) {
        return NextResponse.json(
          { error: 'Title must be less than 200 characters' },
          { status: 400 }
        );
      }

      if (description && description.length > 2000) {
        return NextResponse.json(
          { error: 'Description must be less than 2000 characters' },
          { status: 400 }
        );
      }

      // 이미지 업로드 처리
      let uploadedImages: string[] = [];
      if (files.length > 0) {
        if (files.length > 5) {
          return NextResponse.json(
            { error: 'Maximum 5 images allowed per post' },
            { status: 400 }
          );
        }

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

        uploadedImages = uploadResult.uploadedImages;
      }

      // 게시글 생성
      const post = await prisma.post.create({
        data: {
          authorId: me.id,
          title: title.trim(),
          description: description?.trim() || null,
          images: {
            create: uploadedImages.map((imageUrl, index) => ({
              imageUrl,
              position: index,
              alt: `${title} - Image ${index + 1}`
            }))
          }
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              email: true
            }
          },
          images: {
            orderBy: { position: 'asc' }
          }
        }
      });

      return NextResponse.json({
        success: true,
        post: post
      });
    }

    // JSON data (텍스트만)
    else {
      const body = await request.json();
      const { title, description } = body;

      if (!title || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        );
      }

      if (title.length > 200) {
        return NextResponse.json(
          { error: 'Title must be less than 200 characters' },
          { status: 400 }
        );
      }

      if (description && description.length > 2000) {
        return NextResponse.json(
          { error: 'Description must be less than 2000 characters' },
          { status: 400 }
        );
      }

      const post = await prisma.post.create({
        data: {
          authorId: me.id,
          title: title.trim(),
          description: description?.trim() || null
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              email: true
            }
          },
          images: {
            orderBy: { position: 'asc' }
          }
        }
      });

      return NextResponse.json({
        success: true,
        post: post
      });
    }
  } catch (error) {
    console.error('Post creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50); // 최대 50개
    const authorId = searchParams.get('authorId');
    const postId = searchParams.get('postId');

    // 특정 게시글 조회
    if (postId) {
      const post = await prisma.post.findUnique({
        where: {
          id: postId,
          isActive: true
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              email: true
            }
          },
          images: {
            orderBy: { position: 'asc' }
          }
        }
      });

      if (!post) {
        return NextResponse.json(
          { error: 'Post not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(post);
    }

    // 게시글 목록 조회 (페이지네이션)
    const skip = (page - 1) * limit;

    const whereClause = {
      isActive: true,
      ...(authorId && { authorId })
    };

    const [posts, totalCount] = await Promise.all([
      prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              email: true
            }
          },
          images: {
            orderBy: { position: 'asc' }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.post.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Post fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const me = await requireAuth();
    const body = await request.json();
    const { postId, title, description } = body;

    if (!postId) {
      return NextResponse.json(
        { error: 'Post ID is required' },
        { status: 400 }
      );
    }

    // 게시글 존재 및 권한 확인
    const existingPost = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!existingPost) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (existingPost.authorId !== me.id) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    // 업데이트 데이터 검증
    if (title && title.length > 200) {
      return NextResponse.json(
        { error: 'Title must be less than 200 characters' },
        { status: 400 }
      );
    }

    if (description && description.length > 2000) {
      return NextResponse.json(
        { error: 'Description must be less than 2000 characters' },
        { status: 400 }
      );
    }

    // 게시글 업데이트
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        updatedAt: new Date()
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        images: {
          orderBy: { position: 'asc' }
        }
      }
    });

    return NextResponse.json({
      success: true,
      post: updatedPost
    });
  } catch (error) {
    console.error('Post update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const me = await requireAuth();
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json(
        { error: 'Post ID is required' },
        { status: 400 }
      );
    }

    // 게시글 존재 및 권한 확인
    const existingPost = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!existingPost) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    if (existingPost.authorId !== me.id) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    // 게시글 비활성화 (소프트 삭제)
    await prisma.post.update({
      where: { id: postId },
      data: { isActive: false }
    });

    return NextResponse.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Post deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}