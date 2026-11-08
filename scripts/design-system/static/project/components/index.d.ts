import type * as React from 'react';
/** Built from sazid63/ArchResidenceBD branch v3 (milestone M1): src/ui/kit.tsx (+ Tabs, Slider, Modal wrapping kit.css classes). */
export type Tone = 'neutral' | 'primary' | 'sky' | 'sage' | 'lavender' | 'amber' | 'blush' | 'mint';
export type StatusTone = Tone | 'faint';
export type PhaseStatus = 'not_started' | 'gathering_info' | 'drafted' | 'designed' | 'stale';
export type PhaseKind = 'site' | 'foundation' | 'floor' | 'roof' | 'common';
export type CostType = 'material' | 'labour' | 'machinery' | 'subcontract';
/** Outcome of one check. "not_checked" is shown honestly instead of a fake pass. */
export type CheckResult = 'pass' | 'fail' | 'warn' | 'not_checked' | 'not_applicable';
export interface ButtonProps { children: React.ReactNode; variant?: 'primary' | 'soft' | 'ghost' | 'danger'; size?: 'small' | 'medium' | 'large'; onClick?: React.MouseEventHandler<HTMLButtonElement>; disabled?: boolean; className?: string; style?: React.CSSProperties; title?: string; id?: string; tabIndex?: number; 'aria-label'?: string; }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface CardProps { children: React.ReactNode; /** "card--interactive" adds the hover state */ className?: string; onClick?: React.MouseEventHandler<HTMLDivElement>; style?: React.CSSProperties; role?: string; 'aria-labelledby'?: string; }
export declare function Card(props: CardProps): React.ReactElement;
export interface ChipProps { children: React.ReactNode; tone?: Tone; onClick?: React.MouseEventHandler<HTMLButtonElement>; }
export declare function Chip(props: ChipProps): React.ReactElement;
export interface BadgeProps { children: React.ReactNode; tone?: Tone; }
export declare function Badge(props: BadgeProps): React.ReactElement;
export interface StatusBadgeProps { status: PhaseStatus; label: string; }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;
export interface DotProps { tone: Tone; }
export declare function Dot(props: DotProps): React.ReactElement;
export interface StatusDotProps { status: PhaseStatus; }
export declare function StatusDot(props: StatusDotProps): React.ReactElement;
export interface CalloutProps { title: string; children: React.ReactNode; /** omit for a neutral note */ tone?: 'info' | 'ok' | 'warn' | 'bad'; }
export declare function Callout(props: CalloutProps): React.ReactElement;
export interface StatProps { label: string; value: string; }
export declare function Stat(props: StatProps): React.ReactElement;
export interface PageHeaderProps { title: string; subtitle?: string; actions?: React.ReactNode; }
export declare function PageHeader(props: PageHeaderProps): React.ReactElement;
export interface ResultChipProps { result: CheckResult; lang?: 'en' | 'bn'; /** overrides the built-in label */ children?: React.ReactNode; }
export declare function ResultChip(props: ResultChipProps): React.ReactElement;
export interface ValueProps { children: React.ReactNode; unit?: string; prefix?: string; }
export declare function Value(props: ValueProps): React.ReactElement;
export interface SegmentedControlProps<T extends string> { options: { value: T; label: React.ReactNode }[]; value: T; onChange: (value: T) => void; 'aria-label': string; }
export declare function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): React.ReactElement;
export interface EmptyStateProps { title: string; children?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
export interface ToastProps { children: React.ReactNode; action?: React.ReactNode; }
export declare function Toast(props: ToastProps): React.ReactElement;
export interface TabsProps { items: { id: string; label: React.ReactNode }[]; value: string; onChange?: (id: string) => void; 'aria-label'?: string; }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface SliderProps { value: number; min?: number; max?: number; step?: number; onChange?: (value: number) => void; 'aria-label'?: string; children?: React.ReactNode; }
export declare function Slider(props: SliderProps): React.ReactElement;
export interface ModalProps { title: string; children: React.ReactNode; footer?: React.ReactNode; onClose?: () => void; inline?: boolean; }
export declare function Modal(props: ModalProps): React.ReactElement;
declare global { interface Window { ArchRes: { Button: typeof Button; Card: typeof Card; Chip: typeof Chip; Badge: typeof Badge; StatusBadge: typeof StatusBadge; Dot: typeof Dot; StatusDot: typeof StatusDot; Callout: typeof Callout; Stat: typeof Stat; PageHeader: typeof PageHeader; ResultChip: typeof ResultChip; Value: typeof Value; SegmentedControl: typeof SegmentedControl; EmptyState: typeof EmptyState; Toast: typeof Toast; Tabs: typeof Tabs; Slider: typeof Slider; Modal: typeof Modal; cx: (...parts: Array<string | false | null | undefined>) => string; statusTone: Record<PhaseStatus, StatusTone>; phaseTone: Record<PhaseKind, Tone>; costTone: Record<CostType, Tone> } } }
