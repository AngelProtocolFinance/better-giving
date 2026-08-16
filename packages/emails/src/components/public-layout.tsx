import { EIN, LEGAL_NAME } from "@better-giving/brand";
import { email_colors } from "@better-giving/brand/email";
import type { PropsWithChildren, ReactNode } from "react";
import { Body, Container, Head, Html, Section, Text } from "react-email";
import { APP_NAME } from "../constants";
import { Hr } from "./hr";
import { SocialLinks } from "./social-links";

export type PublicLayoutProps = PropsWithChildren<{
  type?: "registration" | "donation" | "fund";
  bottom_content?: ReactNode;
}>;

export function PublicLayout({
  children,
  type,
  bottom_content,
}: PublicLayoutProps) {
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
          color: email_colors.fg,
        }}
      >
        <Container style={{ padding: 16 }}>
          <Section>
            {children}
            {type !== "donation" && (
              <>
                <Text style={{ margin: 0 }}>
                  {type === "fund" ? "Best" : "Warm"} regards,
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    color: email_colors.primary,
                  }}
                >
                  The {APP_NAME} Team
                </Text>
              </>
            )}
          </Section>
          <Hr />
          <SocialLinks />

          {type === "registration" && (
            <Text style={{ textAlign: "center", margin: 0, marginTop: 4 }}>
              You received this email because you have registered your
              organization with us.
            </Text>
          )}

          <Text
            style={{
              textAlign: "center",
              margin: 0,
              marginTop: 4,
              fontSize: 13,
              color: email_colors.muted_fg,
            }}
          >
            {LEGAL_NAME} | EIN: {EIN} | Copyright {new Date().getUTCFullYear()}{" "}
            All Rights reserved.
          </Text>
          {bottom_content}
        </Container>
      </Body>
    </Html>
  );
}
