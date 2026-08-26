import {
  IsString, IsOptional, MaxLength, IsObject, IsIn, MinLength,
} from 'class-validator'

/**
 * The chat endpoints took inline body types (`@Body() body: { message: string }`), and
 * Nest's ValidationPipe skips any parameter whose metatype is not a class — so these
 * requests were validated by nothing at all.
 *
 * That matters more here than elsewhere because the body is forwarded to a paid model.
 * `express.json({ limit: '20mb' })` allowed a 20 MB message straight through to
 * OpenRouter, and the daily budget guard only reads spend *already recorded*, so it can
 * refuse the request after an expensive one but never the expensive one itself.
 */
const MAX_MESSAGE_CHARS = 4000

export class ChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_CHARS, { message: `Message must be at most ${MAX_MESSAGE_CHARS} characters` })
  message: string

  @IsOptional()
  @IsObject()
  context?: Record<string, any>
}

export class ChatStreamDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_CHARS, { message: `Message must be at most ${MAX_MESSAGE_CHARS} characters` })
  message?: string

  // ~7.5 MB of base64, i.e. a ~5.6 MB photo — comfortably more than any phone camera
  // produces after the client's own downscale, and far below the 20 MB body ceiling.
  @IsOptional()
  @IsString()
  @MaxLength(7_500_000, { message: 'Image is too large' })
  imageBase64?: string

  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  mimeType?: string

  // Stored in `chat_messages.image_analysis` and kept for the 50 most recent messages,
  // so an unbounded value here is an unbounded write repeated 50 times over.
  @IsOptional()
  @IsString()
  @MaxLength(200_000, { message: 'Thumbnail is too large' })
  imageThumbnail?: string

  @IsOptional()
  @IsObject()
  context?: Record<string, any>
}
