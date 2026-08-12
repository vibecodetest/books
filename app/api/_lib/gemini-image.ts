import { GoogleGenAI } from "@google/genai";

export type GeneratedImage = { bytes: Uint8Array; mimeType: string };

export function isGeminiImageEnabled() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function generateReadingImage(input: { bookTitle: string; author: string; memo: string }): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    "다음 독서 기록의 핵심 정서와 장면을 한 장의 따뜻한 에디토리얼 일러스트로 표현해 주세요.",
    `책 제목: ${input.bookTitle}`,
    `저자: ${input.author}`,
    `독서 기록: ${input.memo.slice(0, 1000)}`,
    "가로 4:3 구도, 차분한 종이 질감, 풍부하지만 편안한 색감으로 그려 주세요.",
    "이미지 안에는 글자, 책 제목, 로고, 워터마크를 넣지 마세요.",
    "특정 작가나 현존 예술가의 화풍을 모방하지 말고 독창적인 장면으로 만들어 주세요.",
  ].join("\n");

  const interaction = await ai.interactions.create({
    model: process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image",
    input: prompt,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:3", image_size: "1K" },
  });
  const image = interaction.output_image;
  if (!image?.data) throw new Error("Gemini가 이미지 데이터를 반환하지 않았습니다.");
  return { bytes: Uint8Array.from(Buffer.from(image.data, "base64")), mimeType: image.mime_type || "image/jpeg" };
}
