// import { dom } from "../core/dom";
// import { ComponentBase } from "../component";
// import { IDisposable } from "../disposable";
// //import { RouteManager } from "../example_router/RouteManager";
// import { Dictionary } from "./Dictionary";
// import { isComponent } from "./functions";
// //import { IRouteManager } from "./IRouteManager";
// import { Emitter } from "../delegate";

// const InternalEventStoreMap = new Map<any, any>();
// export class SysInternalNotification {
//         if (!InternalEventStoreMap.has(callback)) {
//         return () => {


//                 if (k === event) {
//                     if (typeof v !== 'function') {
//                         if (v.onRouteChanged && !v.isDisposed) {
//                             if (!v.element.parentElement && v.isMainComponent) {
//                             } else if (v.isRendered) {
//                         if (!v.isDisposed && v._emitCollection) {


//                     } else {


// // export interface IConfigurationOptions {
// //     onReactiveEffectRun?: (type: string, ...args: any[]) => void;

// // export interface IApplicationService {
// //     CreateObject(type: any, params: any): any;




// // const AppWatchKeys = new Dictionary<string | symbol | any, Set<any>>();
// // const latestAppValue = new Dictionary<string | symbol | any, any>();

// // export const ApplicationMiddleware = new Set<(next: () => any, e: ComponentBase) => void>();

// // export class EventHub {

// //         let em = this.channels.get(name);
// //         if (!em) {
// //         return em;

// //         const em = this.getOrCreate(name);
// //         return em.event(listener, thisArgs);


// //         const em = this.channels.get(name);
// //         return !!em && em.hasListeners();

// //         const em = this.channels.get(name);
// //         if (em) {

// //         for (const [, em] of this.channels) {

// // export class motifApplicationService implements IApplicationService {
// //     //public ModelSettings: IModelSettings = { PageSize: 100 };

// //         //return reactive(data)
// //         return null;

// //             if (AppWatchKeys.has(eventName)) {
// //             } else {
// //         return () => {


// //             if (AppWatchKeys.has(eventName)) {
// //             } else {
// //         return () => {

// //     async send(eventName: string | symbol | any, ...args: any[]) {
// //             if (latestAppValue.has(eventName)) {



// //         if (Reflect.ownKeys(module).includes("name")) {
// //             if (!this.extensions.has(module)) {
// //                     if (typeof module[k] === 'function') {
// //                 var init: any = {};
// //                 if (Reflect.ownKeys(module).includes("install")) {
// //         } else {
// //             if (!this.extensions.has(module)) {


// //     public CreateObject(type: any, params: any): any {
// //         var c = type;

// //         if (Object.prototype.toString.call(type) === "[object Module]") {
// //             c = type.default;
// //         var result;
// //         if (typeof c === "function") {
// //             if (isComponent(c.prototype)) {
// //             } else if (c.prototype && typeof c.prototype.constructor === 'function') {
// //                 try {
// //                 } catch (error) {
// //             } else {
// //             return result;

// //         if (!this.starters.has(settings)) {


// // export class ApplicationService {