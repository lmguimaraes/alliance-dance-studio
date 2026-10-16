import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { studioNow } from "@shared/booking";
import {
  addItem,
  EMPTY_CART,
  restoreCart,
  type AddResult,
  type CartItem,
  type CartState,
} from "./cartModel";

// v2: private or group is stored on each item.
const STORAGE_KEY = "alliance.cart.v2";

type CartContextValue = {
  cart: CartState;
  add: (item: Omit<CartItem, "id">) => AddResult;
  remove: (id: string) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? restoreCart(JSON.parse(raw), studioNow().dateKey) : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(readStoredCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Private browsing or full storage: the cart still works for this visit.
    }
  }, [cart]);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setCart(readStoredCart());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (item: Omit<CartItem, "id">): AddResult => {
      const result = addItem(cart, { ...item, id: newId() });
      if (result.ok) setCart(result.state);
      return result;
    },
    [cart]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      add,
      remove: id =>
        setCart(current => ({
          items: current.items.filter(item => item.id !== id),
        })),
      clear: () => setCart(EMPTY_CART),
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [add, cart, isOpen]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider.");
  return context;
}
