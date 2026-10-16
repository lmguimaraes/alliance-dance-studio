import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { isAdminRequest } from "../admin/auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  isAdmin: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    isAdmin: await isAdminRequest(opts.req),
  };
}
