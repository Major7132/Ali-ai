const MODEL = "gemini-3.5-flash-lite";

const headers = {
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Метод не поддерживается." }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return json({
      error: "На сервере не настроен GEMINI_API_KEY."
    }, 500);
  }

  try {
    const body = await request.json();

    if (!Array.isArray(body.contents) || body.contents.length === 0) {
      return json({ error: "Пустое сообщение." }, 400);
    }

    const contents = body.contents.slice(-20).map((item) => {
      const role = item.role === "model" ? "model" : "user";

      const parts = (Array.isArray(item.parts) ? item.parts : [])
        .slice(0, 5)
        .map((part) => {
          if (typeof part.text === "string") {
            return {
              text: part.text.slice(0, 12000)
            };
          }

          if (part.inlineData) {
            const mimeType = part.inlineData.mimeType || "image/jpeg";
            const data = part.inlineData.data || "";

            const allowedTypes = [
              "image/jpeg",
              "image/png",
              "image/webp"
            ];

            if (!allowedTypes.includes(mimeType)) {
              throw new Error("Неподдерживаемый формат фотографии.");
            }

            if (
              typeof data !== "string" ||
              data.length > 6 * 1024 * 1024
            ) {
              throw new Error("Фото слишком большое.");
            }

            return {
              inlineData: {
                mimeType,
                data
              }
            };
          }

          return null;
        })
        .filter(Boolean);

      if (parts.length === 0) {
        parts.push({ text: " " });
      }

      return { role, parts };
    });

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Ты ALISH AI — дружелюбный, полезный AI-помощник. Отвечай на языке пользователя, обычно по-русски. Пиши понятно, естественно и честно. Ты умеешь анализировать присланные фотографии. Если не знаешь ответа, скажи об этом."
            }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const result = await upstream.json();

    if (!upstream.ok) {
      return json({
        error: result?.error?.message ||
          `Ошибка Gemini API (${upstream.status})`
      }, upstream.status);
    }

    const answer = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return json({
        error: "ИИ не вернул текст ответа. Попробуй написать ещё раз."
      }, 502);
    }

    return json({ text: answer });

  } catch (error) {
    return json({
      error: error.message || "Не удалось обработать запрос."
    }, 500);
  }
};
