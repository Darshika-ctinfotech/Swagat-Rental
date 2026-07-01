export const getUserProfileById = async (clientId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getPublicClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    return {
      ...client,
      profile_image: buildPublicFileUrl(client?.profile_image),
    };
  });
};