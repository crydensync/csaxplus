import type { SVGProps } from "react";

/**
 * The six OAuth providers' brand marks, ported from the prototype's inline
 * SVGs with their own colours. These are the one place the console draws
 * somebody else's brand: a provider's logo is how an operator recognises the
 * row, which is what the prototype's card grid was doing with them.
 *
 * Sizing is left to CSS (`.oauth-icon svg`), the same way the line icons do it.
 */

export type BrandIconProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  size?: number;
};

function brand({ size, ...props }: BrandIconProps) {
  return {
    ...props,
    ...(size === undefined ? {} : { width: size, height: size }),
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;
}

/** Google's G, in the prototype's four-colour mark. */
export function BrandGoogle(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.9 1.5l2.7-2.6C17 2.9 14.7 2 12 2 6.8 2 2.6 6.2 2.6 11.9S6.8 21.9 12 21.9c6.9 0 9.3-4.9 9.3-7.4 0-.5 0-.9-.1-1.2H12Z"
      />
    </svg>
  );
}

/** GitHub's octocat, in the prototype's monochrome treatment. */
export function BrandGitHub(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path
        fill="#e6e6ea"
        d="M12 2a10 10 0 0 0-3.16 19.5c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.93 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.83-2.35 4.68-4.58 4.92.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}

/** Discord's game controller mark, in the prototype's blurple. */
export function BrandDiscord(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path
        fill="#5865F2"
        d="M20.3 5.4A17.6 17.6 0 0 0 16 4c-.2.4-.4.9-.6 1.3a16.3 16.3 0 0 0-4.8 0A9 9 0 0 0 10 4a17.6 17.6 0 0 0-4.3 1.4C3 9.6 2.3 13.7 2.6 17.7a17.7 17.7 0 0 0 5.4 2.8c.4-.6.8-1.3 1.1-2a11.4 11.4 0 0 1-1.8-.9l.4-.3a12.7 12.7 0 0 0 10.6 0l.4.3c-.6.3-1.2.6-1.8.9.3.7.7 1.4 1.1 2a17.6 17.6 0 0 0 5.4-2.8c.4-4.6-.8-8.7-3.1-12.3ZM9.7 15.3c-1 0-1.9-1-1.9-2.2 0-1.2.8-2.2 1.9-2.2s2 1 1.9 2.2c0 1.2-.9 2.2-1.9 2.2Zm6.6 0c-1 0-1.9-1-1.9-2.2 0-1.2.8-2.2 1.9-2.2s2 1 1.9 2.2c0 1.2-.9 2.2-1.9 2.2Z"
      />
    </svg>
  );
}

/** Microsoft's four squares, in the prototype's four colours. */
export function BrandMicrosoft(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path fill="#F25022" d="M2 2h9.3v9.3H2V2Z" />
      <path fill="#7FBA00" d="M12.7 2H22v9.3h-9.3V2Z" />
      <path fill="#00A4EF" d="M2 12.7h9.3V22H2v-9.3Z" />
      <path fill="#FFB900" d="M12.7 12.7H22V22h-9.3v-9.3Z" />
    </svg>
  );
}

/** Apple's apple, in the prototype's monochrome treatment. */
export function BrandApple(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path
        fill="#e6e6ea"
        d="M16.4 1.7c.1 1.2-.3 2.4-1.1 3.3-.8.9-2 1.6-3.2 1.5-.1-1.2.4-2.5 1.1-3.3.8-.9 2.1-1.5 3.2-1.5ZM19.9 17c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.3 3.1-4 3.2-1.5.1-1.9-1-3.9-1s-2.5 1-4 1c-1.7-.1-3-1.6-4-3-2.7-3.9-3-8.5-1.3-11 .1-.1.1-.3.2-.4 1-1.6 2.7-2.6 4.5-2.7 1.5-.1 2.9 1 3.9 1 .9 0 2.7-1.2 4.5-1 .8 0 3 .3 4.4 2.4-.1.1-2.6 1.5-2.6 4.5.1 3.5 3 4.7 3.1 4.7-.1.2-.5 1.7-1.3 3.6Z"
      />
    </svg>
  );
}

/** GitLab's fox head. The prototype's six named providers did not include
 * GitLab, but the engine speaks it, so the mark joins the set rather than
 * leaving one provider faceless. */
export function BrandGitLab(props: BrandIconProps) {
  return (
    <svg {...brand(props)}>
      <path
        fill="#FC6D26"
        d="m22.6 13.1-1.1-3.4L18.8 3c-.1-.3-.6-.3-.7 0l-2.4 7.3H8L5.2 3c-.1-.3-.6-.3-.7 0L2.1 9.7 1 13c-.1.3 0 .6.2.8L12 19.3l10.7-5.7c.3-.2.4-.5.3-.8Z"
      />
    </svg>
  );
}

const BRANDS = {
  google: BrandGoogle,
  github: BrandGitHub,
  microsoft: BrandMicrosoft,
  discord: BrandDiscord,
  gitlab: BrandGitLab,
  apple: BrandApple,
} as const;

export type BrandName = keyof typeof BRANDS;

/** The card art for one provider by its API name, or null when unknown. */
export function BrandIcon({ provider, ...props }: BrandIconProps & { provider: string }) {
  const Icon = BRANDS[provider as BrandName];
  return Icon === undefined ? null : <Icon {...props} />;
}

/** True when the console has a mark for this provider name. */
export function isKnownBrand(provider: string): provider is BrandName {
  return provider in BRANDS;
}
