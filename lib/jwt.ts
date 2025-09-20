// /lib/jwt.ts
import { SignJWT, jwtVerify } from "jose";

const SECRET = process.env.JWT_SECRET!;
if (!SECRET) throw new Error("JWT_SECRET is missing in .env");

// jose는 Uint8Array 키 필요
const secretKey = new TextEncoder().encode(SECRET);

export type JwtPayload = {
    sub: string;                 // accountId
    role: "USER" | "COMPANY" | "ADMIN";
    email: string;
};

// 만료 없이 HS256으로 서명 (무기한)
export async function signJwt(payload: JwtPayload) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        // .setExpirationTime("7d")  // ❌ 무기한을 원하므로 설정하지 않음
        .sign(secretKey);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    return payload as JwtPayload;
}
