import { email_colors } from "@better-giving/brand/email";
import type { PropsWithChildren } from "react";
import { Body, Container, Head, Html, Section } from "react-email";
import { APP_NAME } from "../constants";

export type PlatformLayoutProps = PropsWithChildren;

export function PlatformLayout({ children }: PlatformLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <title>{`Email from ${APP_NAME}`}</title>
      </Head>
      <Body
        style={{
          fontFamily: "sans-serif",
          backgroundColor: email_colors.background,
          // explicit ink: clients that force dark mode invert inherited text
          // while still honouring an explicit background — white on white.
          color: email_colors.gray_12,
        }}
      >
        <Container style={{ padding: 16 }}>
          <Section>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}
