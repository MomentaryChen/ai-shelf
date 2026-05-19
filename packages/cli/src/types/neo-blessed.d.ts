declare module "neo-blessed" {
  import blessed from "blessed";
  export = blessed;
}

declare module "neo-blessed/lib/widgets" {
  export * from "blessed/lib/widgets";
}
