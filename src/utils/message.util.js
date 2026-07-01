export const FETCH = [200, ":item fetched successfully."];
export const LOGIN = [200, "Login successfully."];
export const SUCCESS = [200, ":item sent successfully."];
export const SENT_SUCCESS = [200, ":item sent successfully."];
export const ADD_SUCCESS = [200, ":item added successfully."];
export const CONFIRM_SUCCESS = [200, ":item confirmed successfully."];
export const STATUS_SUCCESS = [200, ":item status updated successfully."];
export const UPDATE_SUCCESS = [200, ":item updated successfully."];
export const DELETE_SUCCESS = [200, ":item deleted successfully."];
export const CUSTOM_SUCCESS = [200, ":item."];

export const CUSTOM_ERROR = [400, ":item."];
export const FETCH_ERROR = [400, "Couldn't get :item."];
export const SENT_ERROR = [400, "Couldn't sent :item."];
export const ADD_ERROR = [400, "Couldn't create :item."];
export const UPDATE_ERROR = [400, "Couldn't update :item."];
export const DELETE_ERROR = [400, "Couldn't delete :item."];
export const REQUIRED = [400, ":item is required."];
export const EXISTS = [400, ":item already exists."];
export const INVALID = [400, "Invalid :item."];
export const NOT_MATCH = [400, ":item do not match."];
export const UNAUTHORIZED = [401, ":item is unauthorized. Please login again."];
export const FORBIDDEN = [403, ":item does not have access."];
export const NOT_FOUND = [404, ":item not found."];
export const DB_ERROR = [500, "Database error while :item."];

export const SERVER_ERROR = [500, "Something went wrong. Please try again later."];
