export type AvatarVariant = 'pebble' | 'sprout' | 'orb';

export const AVATARS: { id: AvatarVariant; label: string }[] = [
  { id: 'pebble', label: 'Pebble' },
  { id: 'sprout', label: 'Sprout' },
  { id: 'orb', label: 'Orb' },
];

export function isAvatarVariant(value: string | null): value is AvatarVariant {
  return AVATARS.some((avatar) => avatar.id === value);
}

interface Props {
  variant: AvatarVariant;
  size: 'sm' | 'lg';
}

export default function Avatar({ variant, size }: Props) {
  const className = `avatar avatar-${variant} avatar-${size}`;

  if (variant === 'sprout') {
    return (
      <svg className={className} viewBox="0 0 76 76" aria-hidden="true">
        <path className="avatar-stem" d="M38 66V40" />
        <path className="avatar-leaf avatar-leaf-a" d="M38 44C26 44 18 36 18 26c12 0 20 7 20 18z" />
        <path className="avatar-leaf avatar-leaf-b" d="M38 40C38 28 46 20 58 20c0 11-8 20-20 20z" />
      </svg>
    );
  }

  return <span className={className} aria-hidden="true" />;
}
