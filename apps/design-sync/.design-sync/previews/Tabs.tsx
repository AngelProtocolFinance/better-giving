import { TabPanel, Tabs } from "@better-giving/ui";
import { CodeIcon, TableIcon } from "lucide-react";

export const Default = () => (
  <Tabs
    className="w-96"
    defaultValue="donation"
    items={[
      { value: "donation", label: "Donation" },
      { value: "fundraiser", label: "Fundraiser" },
      { value: "donation-form", label: "Donation Form" },
    ]}
  >
    <TabPanel value="donation" className="mt-4 text-sm">
      Receipt message and donor address settings
    </TabPanel>
    <TabPanel value="fundraiser" className="mt-4 text-sm">
      Let supporters run fundraisers for this nonprofit
    </TabPanel>
    <TabPanel value="donation-form" className="mt-4 text-sm">
      Payment methods, suggested amounts and goal
    </TabPanel>
  </Tabs>
);

export const SmallWithIcons = () => (
  <Tabs
    className="w-96"
    size="sm"
    defaultValue="table"
    items={[
      {
        value: "table",
        label: (
          <>
            <TableIcon size={14} />
            Records
          </>
        ),
      },
      {
        value: "json",
        label: (
          <>
            <CodeIcon size={14} />
            JSON
          </>
        ),
      },
    ]}
  >
    <TabPanel value="table" className="mt-3 text-sm">
      Distribution $1,240.00
    </TabPanel>
    <TabPanel value="json" className="mt-3 text-xs">
      {'{ "_record": "distribution", "net": 1240 }'}
    </TabPanel>
  </Tabs>
);

export const Stretch = () => (
  <Tabs
    className="w-96"
    stretch
    defaultValue="1"
    items={[
      { value: "1", label: "1 Year" },
      { value: "5", label: "5 Year" },
      { value: "10", label: "10 Year" },
    ]}
  >
    <TabPanel value="1" className="mt-4 text-sm">
      Year 1 balance $52,000
    </TabPanel>
    <TabPanel value="5" className="mt-4 text-sm">
      Year 5 balance $281,000
    </TabPanel>
    <TabPanel value="10" className="mt-4 text-sm">
      Year 10 balance $624,000
    </TabPanel>
  </Tabs>
);
