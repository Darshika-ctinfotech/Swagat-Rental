export const getAgreementDates = (startDateInput) => {
    const startDate = startDateInput ? new Date(startDateInput) : new Date();

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 11);

    return {
        startDate,
        endDate,
    };
};