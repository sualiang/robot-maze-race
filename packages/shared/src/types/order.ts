import { OrderStatus, PaymentMethod } from './enums';

/** 参赛包 */
export interface RacePackage {
  id: string;
  name: string;
  description?: string;
  price: number;
  race_count: number;
  valid_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRacePackageParams {
  name: string;
  description?: string;
  price: number;
  race_count: number;
  valid_days: number;
}

/** 订单 */
export interface Order {
  id: string;
  order_no: string;
  user_id: string;
  package_id: string;
  amount: number;
  status: OrderStatus;
  payment_method?: PaymentMethod;
  paid_at?: string;
  refunded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderParams {
  user_id: string;
  package_id: string;
  payment_method?: PaymentMethod;
}
