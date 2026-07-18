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
          backgroundColor: "#fff",
        }}
      >
        <Container style={{ padding: 16 }}>
          <Section>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}
