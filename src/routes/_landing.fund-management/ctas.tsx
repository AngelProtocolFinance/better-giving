import { motion } from "motion/react";
import { href, Link } from "react-router";
import boy_sleeping_in_hammock from "#/assets/landing/boy-sleeping-in-hammock.webp";
import girl_watering_plant from "#/assets/landing/girl-watering-plant.webp";
import man_going_out_of_box from "#/assets/landing/man-going-out-of-box.webp";
import { app_name } from "#/constants/env";
import { BOOK_A_DEMO } from "#/constants/urls";

export function Ctas({ classes = "" }) {
  return (
    <section
      className={`${classes} grid gap-y-20 md:gap-y-32 py-14 md:py-28`}
      aria-label="Key benefits"
    >
      <article className="grid md:grid-cols-2 gap-x-4 items-center">
        <motion.div
          className="grid max-md:order-2"
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring" }}
        >
          <h3 className="text-2xl max-md:text-center md:text-3xl mb-2">
            Your donations, your way.
          </h3>
          <p className="md:text-lg mb-4 max-md:text-center">
            Access funds anytime. Send donations straight to your bank, earn
            3–4% in savings, or grow long-term through the Sustainability Fund;
            your choice, flexible to your needs, and entirely free. No setup
            costs, AUM fees, or performance fees.
          </p>
          <div className="justify-self-center md:justify-self-start">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary inline-flex items-center px-10 py-3 font-bold rounded"
            >
              Join us today!
            </Link>
            <div className="md:ml-3 max-md:text-center mt-2">
              or,{" "}
              <Link
                target="_blank"
                to={BOOK_A_DEMO}
                className="text-sm indent-3 mt-2 underline hover:text-primary"
              >
                Get a Demo
              </Link>
            </div>
          </div>
        </motion.div>
        <img
          src={man_going_out_of_box}
          className="justify-self-center max-md:mb-4"
          width={400}
          alt="Illustration of flexible fund access and financial freedom"
        />
      </article>
      <article className="grid md:grid-cols-2 gap-x-4 items-center">
        <img
          src={boy_sleeping_in_hammock}
          className="justify-self-center max-md:mb-4"
          width={400}
          alt="Illustration of secure and compliant fund management"
        />
        <motion.div
          className="grid"
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring" }}
        >
          <h3 className="text-2xl md:text-3xl mb-2 max-md:text-center">
            Secure and compliant.
          </h3>
          <p className="md:text-lg mb-4 max-md:text-center">
            {app_name}'s financial solutions are held in FDIC-insured bank
            accounts and regulated investment vehicles managed under nonprofit
            oversight. Our investment committee reviews all portfolios to ensure
            responsible, transparent stewardship.
          </p>
          <div className="justify-self-center md:justify-self-start">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary inline-flex items-center px-10 py-3 font-bold rounded"
            >
              Join us today!
            </Link>
            <div className="md:ml-3 max-md:text-center mt-2">
              or,{" "}
              <Link
                target="_blank"
                to={BOOK_A_DEMO}
                className="text-sm indent-3 mt-2 underline hover:text-primary"
              >
                Get a Demo
              </Link>
            </div>
          </div>
        </motion.div>
      </article>
      <article className="grid md:grid-cols-2 gap-x-4 items-center">
        <motion.div
          className="grid max-md:order-2"
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring" }}
        >
          <h3 className="text-2xl max-md:text-center md:text-3xl mb-2">
            Safety and growth.
          </h3>
          <p className="md:text-lg mb-4 max-md:text-center">
            To successfully manage capital, you require safety and liquidity for
            near-term obligations, alongside growth to preserve purchasing power
            over time. Idle cash loses value to inflation, while over-exposure
            to market risk can threaten operating stability. {app_name}'s
            approach separates these needs rather than forcing a tradeoff.
          </p>
          <div className="justify-self-center md:justify-self-start">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary inline-flex items-center px-10 py-3 font-bold rounded"
            >
              Join us today!
            </Link>
            <div className="md:ml-3 max-md:text-center mt-2">
              or,{" "}
              <Link
                target="_blank"
                to={BOOK_A_DEMO}
                className="text-sm indent-3 mt-2 underline hover:text-primary"
              >
                Get a Demo
              </Link>
            </div>
          </div>
        </motion.div>
        <img
          src={girl_watering_plant}
          className="justify-self-center max-md:mb-4"
          width={400}
          height={400}
          alt="Illustration of safety and growth"
        />
      </article>
    </section>
  );
}
